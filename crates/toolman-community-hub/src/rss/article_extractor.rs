use std::collections::HashSet;

use scraper::{Html, Selector};

#[derive(Debug, thiserror::Error)]
pub enum ArticleExtractError {
    #[error("failed to fetch article: {0}")]
    Http(#[from] reqwest::Error),
    #[error("article page was empty")]
    EmptyResponse,
}

pub fn content_is_sufficient(content: Option<&str>) -> bool {
    let Some(content) = content else {
        return false;
    };
    crate::rss::strip_html_tags(content).chars().count() >= 200
}

pub async fn fetch_article_content(url: &str) -> Result<String, ArticleExtractError> {
    let client = reqwest::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        )
        .build()?;

    let response = client.get(url).send().await?.error_for_status()?;
    let bytes = response.bytes().await?;
    if bytes.is_empty() {
        return Err(ArticleExtractError::EmptyResponse);
    }

    let html = decode_html_bytes(&bytes);
    let extracted = extract_article_html(&html).ok_or(ArticleExtractError::EmptyResponse)?;
    Ok(normalize_extracted_article_html(extracted, Some(url)))
}

const MAX_ARTICLE_HTML_CHARS: usize = 40_000;

pub fn extract_article_html(html: &str) -> Option<String> {
    let document = Html::parse_document(html);

    let selectors = [
        "article",
        ".article-content",
        ".article__content",
        ".content-main",
        ".rich-text",
        "#detailContent",
        "#artibody",
    ];

    for selector in selectors {
        let Ok(parsed) = Selector::parse(selector) else {
            continue;
        };

        if let Some(node) = document.select(&parsed).next() {
            let fragment = node.html();
            if crate::rss::strip_html_tags(&fragment).chars().count() >= 120 {
                return Some(normalize_extracted_article_html(fragment, None));
            }
        }
    }

    None
}

pub fn normalize_extracted_article_html(html: String, base_url: Option<&str>) -> String {
    if should_simplify_article_html(&html) {
        if let Some(simplified) = simplify_article_html(&html, base_url) {
            return truncate_article_html(simplified);
        }

        let plain = crate::rss::strip_html_tags(&html);
        if plain.chars().count() >= 20 {
            return truncate_article_html(format!("<p>{}</p>", html_escape(&plain)));
        }

        return String::new();
    }

    truncate_article_html(html)
}

fn is_page_shell_html(html: &str) -> bool {
    if html.len() < 1500 {
        return false;
    }

    const MARKERS: &[&str] = &[
        "@container",
        "radix-",
        "chatgpt-conversation",
        "data-dgst=",
        "toc-visible",
        "max-w-container",
        "article-mian-content",
        "article-wrapper",
        "common-width",
    ];

    if MARKERS.iter().any(|marker| html.contains(marker)) {
        return true;
    }

    html.matches("<div").count() >= 15
}

fn should_simplify_article_html(html: &str) -> bool {
    is_page_shell_html(html) || html.matches("<div").count() >= 10
}

pub fn simplify_article_html(html: &str, _base_url: Option<&str>) -> Option<String> {
    let document = Html::parse_fragment(html);
    let mut parts = Vec::new();
    let mut seen = HashSet::new();

    let heading_selector = Selector::parse("h1, h2, h3").ok()?;
    for element in document.select(&heading_selector) {
        let text = crate::rss::strip_html_tags(&element.inner_html());
        if text.chars().count() >= 4 && seen.insert(format!("h:{text}")) {
            let tag = element.value().name();
            parts.push(format!("<{tag}>{}</{tag}>", html_escape(&text)));
        }
    }

    let paragraph_selector = Selector::parse("p").ok()?;
    for element in document.select(&paragraph_selector) {
        let text = crate::rss::strip_html_tags(&element.inner_html());
        if text.chars().count() >= 8 && seen.insert(format!("p:{text}")) {
            parts.push(format!("<p>{}</p>", html_escape(&text)));
        }
    }

    let list_item_selector = Selector::parse("ul > li, ol > li").ok()?;
    let mut list_items = Vec::new();
    for element in document.select(&list_item_selector) {
        let text = crate::rss::strip_html_tags(&element.inner_html());
        if text.chars().count() >= 4 && seen.insert(format!("li:{text}")) {
            list_items.push(format!("<li>{}</li>", html_escape(&text)));
        }
    }
    if !list_items.is_empty() {
        parts.push(format!("<ul>{}</ul>", list_items.join("")));
    }

    let image_selector = Selector::parse("img[src]").ok()?;
    let mut image_count = 0usize;
    for element in document.select(&image_selector) {
        if image_count >= 3 {
            break;
        }
        let Some(src) = element.value().attr("src") else {
            continue;
        };
        if !(src.starts_with("http://") || src.starts_with("https://")) {
            continue;
        }
        let alt = element.value().attr("alt").unwrap_or("");
        parts.push(format!(
            r#"<p><img src="{}" alt="{}" loading="lazy" /></p>"#,
            html_escape(src),
            html_escape(alt),
        ));
        image_count += 1;
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join("\n"))
    }
}

fn html_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn truncate_article_html(html: String) -> String {
    if html.chars().count() <= MAX_ARTICLE_HTML_CHARS {
        return html;
    }

    html.chars().take(MAX_ARTICLE_HTML_CHARS).collect::<String>() + "…"
}

fn decode_html_bytes(bytes: &[u8]) -> String {
    if let Ok(text) = std::str::from_utf8(bytes) {
        return text.to_string();
    }

    let (decoded, _, _) = encoding_rs::GB18030.decode(bytes);
    decoded.into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SHELL_HTML: &str = r#"
<article class="@container max-w-container">
  <h2><span>Usage analytics</span></h2>
  <p><span>As AI becomes part of everyday work, organizations need better visibility.</span></p>
  <p><span>Today, we are introducing credit usage analytics for ChatGPT Enterprise.</span></p>
  <ul><li><span>Track usage trends over time</span></li></ul>
</article>
"#;

    #[test]
    fn detects_page_shell_html() {
        let repeated = SHELL_HTML.repeat(20);
        assert!(is_page_shell_html(&repeated));
        assert!(!is_page_shell_html("<p>Short summary</p>"));
    }

    #[test]
    fn simplifies_page_shell_html() {
        let repeated = SHELL_HTML.repeat(20);
        let simplified = simplify_article_html(&repeated, None).expect("simplified html");
        assert!(simplified.contains("<h2>Usage analytics</h2>"));
        assert!(simplified.contains("credit usage analytics"));
        assert!(!simplified.contains("@container"));
        assert!(simplified.len() < repeated.len() / 4);
    }
}
