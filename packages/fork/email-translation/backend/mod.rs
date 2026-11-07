//! Private feature: Email AI translation & PostgreSQL persistence (`EMAIL-TRANSLATION-001`).

pub mod hash;
pub mod repo;
pub mod routes;
pub mod segmenter;
pub mod service;

#[cfg(test)]
mod test;

pub use routes::router;
