use super::*;

#[test]
fn batch_too_large_error_returns_bad_request() {
    let err = ReadReceiptStatusError::BatchTooLarge(201, MAX_BATCH_SIZE);
    let response = err.into_response();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}
