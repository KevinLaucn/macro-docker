use super::*;

#[test]
fn batch_too_large_error_returns_bad_request() {
    let err = ReadReceiptStatusError::BatchTooLarge(201, MAX_BATCH_SIZE);
    let response = err.into_response();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

#[test]
fn thread_read_receipt_status_serialization() {
    let thread_id = Uuid::new_v4();
    let message_id = Uuid::new_v4();
    let status = ThreadReadReceiptStatus {
        thread_id,
        latest_sent_message_id: message_id,
        latest_message_id: message_id,
        is_last_message_sent: true,
        is_opened: true,
        open_count: 5,
        first_opened_at: None,
        last_opened_at: None,
    };
    let response = ThreadReadReceiptStatusesResponse {
        statuses: vec![status],
    };
    let json = serde_json::to_string(&response).expect("serialization should succeed");
    assert!(json.contains("latest_message_id"));
    assert!(json.contains("is_last_message_sent"));
    assert!(json.contains("is_opened"));
    assert!(json.contains("\"open_count\":5"));
}
