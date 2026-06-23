pub fn strip_html_tags(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let mut in_tag = false;

    for ch in input.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            value if !in_tag => output.push(value),
            _ => {}
        }
    }

    decode_basic_entities(&output)
        .lines()
        .map(|line| line.split_whitespace().collect::<Vec<_>>().join(" "))
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn normalize_summary(raw: &str, title: &str) -> String {
    let stripped = strip_html_tags(raw);
    if stripped.is_empty() {
        return String::new();
    }

    let content: Vec<&str> = stripped
        .split(['\n', '\r'])
        .map(str::trim)
        .filter(|line| !line.is_empty() && !is_metadata_line(line))
        .collect();

    let text = if content.is_empty() {
        stripped
    } else {
        content.join(" ")
    };

    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.eq_ignore_ascii_case(title.trim()) {
        return String::new();
    }

    normalized
}

pub fn extract_cover_url(html: Option<&str>) -> Option<String> {
    let html = html?;
    let lower = html.to_ascii_lowercase();
    let marker = "<img";
    let mut search_from = 0usize;

    while let Some(tag_start) = lower[search_from..].find(marker) {
        let absolute_start = search_from + tag_start;
        let tag_end = lower[absolute_start..]
            .find('>')
            .map(|index| absolute_start + index + 1)?;
        let tag = &html[absolute_start..tag_end];
        if let Some(src) = extract_attribute(tag, "src") {
            let trimmed = src.trim();
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
        search_from = tag_end;
    }

    None
}

fn extract_attribute(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let needle = format!("{name}=");
    let start = lower.find(&needle)? + needle.len();
    let remainder = tag.get(start..)?.trim_start();

    if let Some(value) = remainder.strip_prefix('"') {
        return value.split('"').next().map(str::to_string);
    }
    if let Some(value) = remainder.strip_prefix('\'') {
        return value.split('\'').next().map(str::to_string);
    }

    remainder
        .split_whitespace()
        .next()
        .map(str::to_string)
}

fn is_metadata_line(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    lower.starts_with("article url:")
        || lower.starts_with("comments url:")
        || lower.starts_with("points:")
        || lower.starts_with("# comments:")
        || lower.starts_with("via:")
}

fn decode_basic_entities(input: &str) -> String {
    input
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

pub fn sanitize_text(input: &str) -> String {
    decode_basic_entities(input)
        .replace('\u{FFFD}', "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_html_and_metadata_lines() {
        let raw = "<p>Article URL: <a href=\"https://example.com\">link</a></p>\n<p>真实摘要内容在这里。</p>";
        let summary = normalize_summary(raw, "标题");
        assert!(summary.contains("真实摘要内容"));
        assert!(!summary.to_ascii_lowercase().contains("article url"));
    }

    #[test]
    fn extracts_cover_url_from_html() {
        let html = r#"<p>Hello</p><img src="https://cdn.example.com/cover.jpg" alt="" />"#;
        assert_eq!(
            extract_cover_url(Some(html)),
            Some("https://cdn.example.com/cover.jpg".to_string())
        );
    }
}
