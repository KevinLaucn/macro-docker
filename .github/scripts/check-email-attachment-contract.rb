#!/usr/bin/env ruby
# frozen_string_literal: true

# Lightweight source-seam regression checks, not runtime or provider tests.
# Fail closed on upstream refactors: review the new call path before adapting.
root = File.expand_path(ARGV.fetch(0, "../.."), __dir__)
read = ->(path) { File.read(File.join(root, path)) }
errors = []
check = ->(name, passed) { errors << name unless passed }

routes = read.call("services/email_service/src/api/email/attachments.rs")
check.call("attachment routes", routes.include?('get(get::handler)') &&
  routes.include?('get(get::download_handler)') &&
  routes.include?('get(get_document_id::handler)'))

provider = read.call("services/email_service/src/api/email/attachments/get.rs")
cached, fallback = provider.split("let presigned_url = if exists {", 2).last.to_s.split("} else {", 2)
check.call("cache-first read and owning-inbox provider fallback",
  provider.match?(/\.exists\(bucket, &object_key\)/) &&
  provider.index("fetch_attachment_by_id") && provider.index("let exists") &&
  provider.index("fetch_attachment_by_id") < provider.index("let exists") &&
  cached.to_s.include?("get_presigned_url(") && !cached.to_s.include?(".get_attachment(") &&
  fallback.to_s.include?(".get_attachment(link.id, &message_provider_id, provider_attachment_id)") &&
  fallback.to_s.include?("upload_single_attachment("))

document = read.call("services/email_service/src/api/email/attachments/get_document_id.rs")
handler, probe = document.split("async fn verify_and_get_cached_document_id(", 2)
missing = probe.to_s[/Ok\(false\) => \{(.*?)\n        \}/m, 1].to_s
check.call("private missing-document recovery reaches the existing upload",
  handler.scan("verify_and_get_cached_document_id(&ctx, attachment_id).await?").length == 2 &&
  handler.include?("acquire_lock(") && handler.include?("upload_and_get_document_id(") &&
  handler.include?("upload_attachment(ctx_upload, upload_args)") &&
  probe.to_s.include?(".exists(&bucket, &s3_key)") &&
  missing.include?("DELETE FROM document_email") && missing.include?('UPDATE "Document"') &&
  missing.include?("Ok(None)"))

client = read.call("apps/web/src/lib/service-clients/service-email/client.ts")
integration = read.call("apps/web/src/lib/queries/email/integration.ts")
opener = read.call("apps/web/src/features/email-message/attachment-action-adapter.ts")
check.call("frontend attachment API seams",
  client.include?("`/email/attachments/${id}`") &&
  client.include?("`/email/attachments/${id}/document_id`") &&
  integration.include?("emailClient.getOrCreateAttachmentDocumentId({ id })") &&
  opener.include?("await getEmailAttachmentDocument(dbId)"))

if errors.any?
  warn "Email attachment contract failed: #{errors.join('; ')}"
  warn "Review the upstream call paths; do not remove checks to bypass a failure."
  exit 1
end
puts "Email attachment source contracts: 4 passed (no build or network)"
