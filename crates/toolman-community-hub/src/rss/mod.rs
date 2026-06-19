mod article_extractor;
mod fetcher;
mod normalize;

pub use article_extractor::{content_is_sufficient, extract_article_html, fetch_article_content, ArticleExtractError};
pub use fetcher::{fetch_feed, parse_feed, FetchedFeed, FetchedFeedEntry, RssFetchError};
pub use normalize::{extract_cover_url, normalize_summary, sanitize_text, strip_html_tags};
