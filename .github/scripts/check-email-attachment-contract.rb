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

provider = read.call("services/email_service/src/outbound/attachment_access.rs")
domain = read.call("crates/email/src/domain/attachment_access.rs")
repo = read.call("crates/email/src/outbound/email_pg_repo/attachment_access.rs")
check.call("cache-first read and owning-inbox provider fallback",
  repo.include?("fetch_attachment_by_id") &&
  domain.include?("self.files.cached_url(&record).await?") &&
  domain.include?("let bytes = self.provider.bytes(&record).await?;") &&
  domain.include?("self.files.store_download(&record, bytes).await?") &&
  provider.match?(/\.exists\(&self\.bucket, &key\)/) &&
  provider.include?(".get_attachment(record.link.id, &record.message_provider_id, id)") &&
  provider.include?("async fn store_download("))

document = read.call("services/email_service/src/api/email/attachments/get_document_id.rs")
document_repo = read.call("crates/documents/src/outbound/pg_document_repo.rs")
document_create = read.call("crates/documents/src/outbound/pg_document_repo/create.rs")
handler, probe = document.split("async fn verify_and_get_cached_document_id(", 2)
missing = probe.to_s[/Ok\(false\) => \{(.*?)\n        \}/m, 1].to_s
check.call("private missing-document recovery reaches the existing upload",
  handler.scan("verify_and_get_cached_document_id(&ctx, attachment_id).await?").length == 1 &&
  handler.include?(".attachment_reads.authorize(actor, attachment_id).await?") &&
  document_repo.include?("async fn import_email_attachment_document(") &&
  document_repo.include?("create::reuse_email_document(") &&
  document_repo.include?(".reused_linked_email_attachment(email_attachment_id)") &&
  document_create.include?("pg_advisory_xact_lock(hashtext($1), hashtext($2))") &&
  document_create.include?("find_document_id_for_email_attachment(&mut **transaction, email_attachment_id)") &&
  handler.include?(".document(") &&
  provider.include?("crate::util::upload_attachment::store_attachment(") &&
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

attachment_access = read.call("services/email_service/src/outbound/attachment_access.rs")
caddyfile = read.call("self-host/Caddyfile")
check.call("self-host S3 attachment download path",
  attachment_access.include?("macro_aws_config::is_local_aws()") &&
  caddyfile.include?("handle_path /macro-email-attachments/* {") &&
  caddyfile.include?("rewrite * /macro-email-attach{path}"))

pdf_actions = read.call("apps/web/src/features/block-pdf/util/pdf-file-actions.ts")
adobe_inspect = read.call("packages/fork/adobe-preview/inspect.ts")
check.call("adobe original attachment download protection",
  pdf_actions.include?("PRIVATE-HOOK: adobe_preview:pdf_download_original_action") &&
  pdf_actions.include?("downloadOriginalAdobeDocument(auth.documentId, auth.fileName)") &&
  adobe_inspect.include?("export async function downloadOriginalAdobeDocument(") &&
  adobe_inspect.include?("await fetchBinaryDocumentData(documentId)") &&
  adobe_inspect.include?("'application/postscript'"))

if errors.any?
  warn "Email attachment contract failed: #{errors.join('; ')}"
  warn "Review the upstream call paths; do not remove checks to bypass a failure."
  exit 1
end
puts "Email attachment source contracts: 6 passed (no build or network)"
