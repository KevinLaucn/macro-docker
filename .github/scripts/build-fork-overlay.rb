#!/usr/bin/env ruby
# frozen_string_literal: true

require "optparse"
require "open3"
require "pathname"
require "yaml"

options = {}
OptionParser.new do |parser|
  parser.on("--baseline SHA") { |v| options[:baseline] = v }
  parser.on("--head SHA") { |v| options[:head] = v }
  parser.on("--patch PATH") { |v| options[:patch] = v }
  parser.on("--selected PATH") { |v| options[:selected] = v }
  parser.on("--dropped PATH") { |v| options[:dropped] = v }
end.parse!

%i[baseline head patch selected dropped].each do |key|
  abort "missing --#{key}" if options[key].nil? || options[key].empty?
end

root = Pathname.new(__dir__).join("../..").cleanpath
Dir.chdir(root)

def git!(*args)
  out, err, status = Open3.capture3("git", *args)
  abort err unless status.success?
  out
end

def path_matches?(pattern, path)
  if pattern.end_with?("/**")
    prefix = pattern.delete_suffix("/**")
    return path == prefix || path.start_with?("#{prefix}/")
  end

  File.fnmatch?(pattern, path, File::FNM_PATHNAME | File::FNM_EXTGLOB)
end

customizations = YAML.safe_load(
  File.read(".fork/customizations.yml"),
  permitted_classes: [],
  aliases: false
).fetch("customizations")

hooks = YAML.safe_load(
  File.read(".fork/private-hooks.yml"),
  permitted_classes: [],
  aliases: false
).fetch("hooks")

patterns = customizations.flat_map { |entry| entry.fetch("paths") }
hook_files = hooks.map { |hook| hook.fetch("file") }

override_files = Dir[".fork/overrides/*.yml"].flat_map do |file|
  data = YAML.safe_load(File.read(file), permitted_classes: [], aliases: false)
  Array(data && data["overrides"]).filter_map { |entry| entry["file"] }
end

changed = git!(
  "diff", "--no-renames", "--name-only", options[:baseline], options[:head]
).lines(chomp: true).reject(&:empty?).uniq.sort

private_skill = lambda do |path|
  path.start_with?(".agents/skills/macro-private-maintainer/") ||
    path.start_with?(".agents/skills/macro-pre-push-gate/")
end

upstream_skill = lambda do |path|
  path.start_with?(".agents/skills/") && !private_skill.call(path)
end

owned = lambda do |path|
  next false if upstream_skill.call(path)
  hook_files.include?(path) ||
    override_files.include?(path) ||
    patterns.any? { |pattern| path_matches?(pattern, path) }
end

selected = changed.select { |path| owned.call(path) }
dropped = changed - selected

File.write(options[:selected], selected.join("\n") + (selected.empty? ? "" : "\n"))
File.write(options[:dropped], dropped.join("\n") + (dropped.empty? ? "" : "\n"))

File.open(options[:patch], "wb") do |io|
  args = [
    "git", "diff", "--no-renames", "--binary", "--full-index",
    options[:baseline], options[:head], "--", *selected
  ]
  pid = Process.spawn(*args, out: io, err: $stderr)
  _waited_pid, status = Process.wait2(pid)
  abort "git diff failed" unless status.success?
end

puts "Fork overlay built"
puts "  baseline: #{options[:baseline]}"
puts "  head:     #{options[:head]}"
puts "  selected: #{selected.length}"
puts "  dropped:  #{dropped.length}"

unless dropped.empty?
  puts "Unregistered historical drift intentionally excluded from overlay."
end
