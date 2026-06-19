use chrono::{DateTime, Utc};
use feed_rs::model::Entry;
use sha2::{Digest, Sha256};

#[derive(Debug, Clone)]
pub struct FetchedFeedEntry {
    pub guid: String,
    pub title: String,
    pub summary: String,
    pub content_html: Option<String>,
    pub link: String,
    pub author: Option<String>,
    pub published_at: i64,
}

#[derive(Debug, Clone)]
pub struct FetchedFeed {
    pub title: Option<String>,
    pub site_url: Option<String>,
    pub entries: Vec<FetchedFeedEntry>,
}

#[derive(Debug, thiserror::Error)]
pub enum RssFetchError {
    #[error("failed to fetch feed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("feed parse error: {0}")]
    Parse(String),
    #[error("feed response was empty")]
    EmptyResponse,
    #[error("entry is missing both id and link")]
    MissingEntryIdentity,
}

pub async fn fetch_feed(url: &str) -> Result<FetchedFeed, RssFetchError> {
    let client = reqwest::Client::builder()
        .user_agent("Toolman-Community-Hub/1.0")
        .build()?;

    let response = client.get(url).send().await?.error_for_status()?;
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let bytes = response.bytes().await?;
    if bytes.is_empty() {
        return Err(RssFetchError::EmptyResponse);
    }

    let decoded = decode_feed_bytes(&bytes, content_type.as_deref());
    parse_feed(&decoded)
}

fn decode_feed_bytes(bytes: &[u8], content_type: Option<&str>) -> Vec<u8> {
    if std::str::from_utf8(bytes).is_ok() {
        return bytes.to_vec();
    }

    if let Some(encoding) = content_type.and_then(|header| {
        header
            .split("charset=")
            .nth(1)
            .map(|value| value.trim().trim_matches('"').to_ascii_lowercase())
    }) {
        if matches!(encoding.as_str(), "gbk" | "gb2312" | "gb18030") {
            let (decoded, _, _) = encoding_rs::GB18030.decode(bytes);
            return decoded.into_owned().into_bytes();
        }
    }

    if let Some(encoding) = detect_xml_encoding(bytes) {
        if matches!(encoding.as_str(), "gbk" | "gb2312" | "gb18030") {
            let (decoded, _, _) = encoding_rs::GB18030.decode(bytes);
            return decoded.into_owned().into_bytes();
        }
    }

    bytes.to_vec()
}

fn detect_xml_encoding(bytes: &[u8]) -> Option<String> {
    let prefix = std::str::from_utf8(bytes.get(..256)?).ok()?;
    let lower = prefix.to_ascii_lowercase();
    let marker = "encoding=\"";
    let start = lower.find(marker)? + marker.len();
    let remainder = prefix.get(start..)?;
    let end = remainder.find('"')?;
    Some(remainder[..end].trim().to_ascii_lowercase())
}

pub fn parse_feed(bytes: &[u8]) -> Result<FetchedFeed, RssFetchError> {
    let feed = feed_rs::parser::parse(bytes).map_err(|error| RssFetchError::Parse(error.to_string()))?;
    let entries = feed
        .entries
        .into_iter()
        .filter_map(|entry| map_entry(entry).ok())
        .collect();

    Ok(FetchedFeed {
        title: feed.title.map(|value| value.content),
        site_url: feed
            .links
            .first()
            .map(|link| link.href.clone())
            .or_else(|| {
                if feed.id.trim().is_empty() {
                    None
                } else {
                    Some(feed.id.clone())
                }
            }),
        entries,
    })
}

fn map_entry(entry: Entry) -> Result<FetchedFeedEntry, RssFetchError> {
    let guid = entry_guid(&entry)?;
    let title = crate::rss::sanitize_text(
        &entry
            .title
            .map(|value| value.content)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "Untitled".to_string()),
    );
    let link = entry
        .links
        .first()
        .map(|value| value.href.clone())
        .unwrap_or_default();
    let raw_summary = entry
        .summary
        .map(|value| value.content)
        .or_else(|| {
            entry
                .content
                .as_ref()
                .and_then(|value| value.body.clone())
        })
        .unwrap_or_default();
    let content_html = entry.content.and_then(|value| value.body).or_else(|| {
        if raw_summary.contains('<') {
            Some(raw_summary.clone())
        } else {
            None
        }
    });
    let summary = {
        let normalized = crate::rss::normalize_summary(&raw_summary, &title);
        if normalized.is_empty() {
            crate::rss::normalize_summary(content_html.as_deref().unwrap_or_default(), &title)
        } else {
            normalized
        }
    };
    let author = entry
        .authors
        .first()
        .map(|value| crate::rss::sanitize_text(&value.name))
        .filter(|value| !value.trim().is_empty() && !is_placeholder_author(value));
    let published_at = entry
        .published
        .or(entry.updated)
        .map(timestamp_millis)
        .unwrap_or_else(|| Utc::now().timestamp_millis());

    Ok(FetchedFeedEntry {
        guid,
        title,
        summary,
        content_html,
        link,
        author,
        published_at,
    })
}

fn entry_guid(entry: &Entry) -> Result<String, RssFetchError> {
    if !entry.id.trim().is_empty() {
        return Ok(entry.id.clone());
    }

    if let Some(link) = entry.links.first() {
        if !link.href.trim().is_empty() {
            return Ok(link.href.clone());
        }
    }

    let title = entry.title.as_ref().map(|value| value.content.as_str()).unwrap_or("");
    let published = entry
        .published
        .or(entry.updated)
        .map(timestamp_millis)
        .unwrap_or(0);
    if title.is_empty() && published == 0 {
        return Err(RssFetchError::MissingEntryIdentity);
    }

    let digest = Sha256::digest(format!("{title}:{published}").as_bytes());
    Ok(hex::encode(digest))
}

fn timestamp_millis(value: DateTime<Utc>) -> i64 {
    value.timestamp_millis()
}

fn is_placeholder_author(author: &str) -> bool {
    matches!(author.trim().to_ascii_lowercase().as_str(), "author" | "unknown" | "admin")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_RSS: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Sample RSS</title>
    <link>https://example.com</link>
    <item>
      <title>First Post</title>
      <link>https://example.com/posts/1</link>
      <guid>post-1</guid>
      <description>Hello RSS</description>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>"#;

    const SAMPLE_ATOM: &str = r#"<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Sample Atom</title>
  <link href="https://example.com"/>
  <entry>
    <id>atom-entry-1</id>
    <title>Atom Post</title>
    <link href="https://example.com/atom/1"/>
    <summary>Hello Atom</summary>
    <updated>2024-02-01T08:00:00Z</updated>
  </entry>
</feed>"#;

    #[test]
    fn parses_rss_feed_entries() {
        let feed = parse_feed(SAMPLE_RSS.as_bytes()).expect("parse rss");
        assert_eq!(feed.entries.len(), 1);
        assert_eq!(feed.entries[0].guid, "post-1");
        assert_eq!(feed.entries[0].title, "First Post");
        assert_eq!(feed.entries[0].summary, "Hello RSS");
    }

    #[test]
    fn parses_atom_feed_entries() {
        let feed = parse_feed(SAMPLE_ATOM.as_bytes()).expect("parse atom");
        assert_eq!(feed.entries.len(), 1);
        assert_eq!(feed.entries[0].guid, "atom-entry-1");
        assert_eq!(feed.entries[0].title, "Atom Post");
        assert_eq!(feed.entries[0].summary, "Hello Atom");
    }
}
