//! Generate the repo's GitHub Actions workflows from Rust.
//!
//! `cargo x workflows` writes every entry in [`WORKFLOWS`] to
//! `<repo-root>/.github/workflows/<filename>`. The `--check` variant regenerates
//! them in memory and fails if the committed YAML has drifted, so CI can
//! guarantee the checked-in YAML always matches this source.
//!
//! Layout mirrors Zed's xtask: one file per workflow plus three shared "library"
//! files — [`runners`] (runner labels), [`vars`] (env / secrets / concurrency),
//! and [`steps`] (reusable step + job helpers).

mod assign_author;
mod assign_labels;
mod cargo_deny;
mod cargo_workspace_dependency_check;
mod check_generated;
mod check_node_modules_nix;
mod cla;
mod code_check_cloud_storage;
mod code_check_conventions;
mod code_check_infra;
mod docs_check;
mod path_validation;
mod publish_sdk;
mod release;
mod runners;
mod sdk_check;
mod steps;
mod vars;
mod web_app_check_main;
mod web_artifact_paths;

use std::fs;
use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use gh_workflow::Workflow;

/// A generated workflow. `slug` is the snake_case source module (`<slug>.rs`)
/// used in the generated header. `file_name` is explicit so generated workflows
/// can replace existing hyphenated GitHub workflow filenames without changing
/// their identity in GitHub Actions.
struct WorkflowFile {
    slug: &'static str,
    /// Output filename under `.github/workflows/`.
    file_name: &'static str,
    /// Produces the YAML body for this workflow.
    render_yaml: fn() -> Result<String>,
}

/// Render a `gh_workflow::Workflow` to YAML. Used by most workflow modules.
fn render_gh_workflow(build: fn() -> Workflow) -> impl Fn() -> Result<String> {
    move || build().to_string().map_err(|e| anyhow::anyhow!("{e:?}"))
}

/// Every workflow we generate. Add new workflows here.
const WORKFLOWS: &[WorkflowFile] = &[
    WorkflowFile {
        slug: "assign_author",
        file_name: "assign-author.yml",
        render_yaml: || render_gh_workflow(assign_author::assign_author)(),
    },
    WorkflowFile {
        slug: "assign_labels",
        file_name: "assign-labels.yml",
        render_yaml: || render_gh_workflow(assign_labels::assign_labels)(),
    },
    WorkflowFile {
        slug: "code_check_infra",
        file_name: "code_check_infra.yml",
        render_yaml: || render_gh_workflow(code_check_infra::code_check_infra)(),
    },
    WorkflowFile {
        slug: "cargo_deny",
        file_name: "cargo_deny.yml",
        render_yaml: || render_gh_workflow(cargo_deny::cargo_deny)(),
    },
    WorkflowFile {
        slug: "cargo_workspace_dependency_check",
        file_name: "cargo_workspace_dependency_check.yml",
        render_yaml: || {
            render_gh_workflow(cargo_workspace_dependency_check::cargo_workspace_dependency_check)()
        },
    },
    WorkflowFile {
        slug: "cla",
        file_name: "cla.yml",
        render_yaml: || render_gh_workflow(cla::cla)(),
    },
    WorkflowFile {
        slug: "code_check_cloud_storage",
        file_name: "code_check_cloud_storage.yml",
        render_yaml: || render_gh_workflow(code_check_cloud_storage::code_check_cloud_storage)(),
    },
    WorkflowFile {
        slug: "code_check_conventions",
        file_name: "code_check_conventions.yml",
        render_yaml: || render_gh_workflow(code_check_conventions::code_check_conventions)(),
    },
    WorkflowFile {
        slug: "check_node_modules_nix",
        file_name: "check_node_modules_nix.yml",
        render_yaml: || render_gh_workflow(check_node_modules_nix::check_node_modules_nix)(),
    },
    WorkflowFile {
        slug: "check_generated",
        file_name: "check_generated.yml",
        render_yaml: || render_gh_workflow(check_generated::check_generated_workflows)(),
    },
    WorkflowFile {
        slug: "web_app_check_main",
        file_name: "web-app-check-main.yml",
        render_yaml: || render_gh_workflow(web_app_check_main::web_app_check_main)(),
    },
    WorkflowFile {
        slug: "sdk_check",
        file_name: "sdk-check.yml",
        render_yaml: || render_gh_workflow(sdk_check::sdk_check)(),
    },
    WorkflowFile {
        slug: "docs_check",
        file_name: "docs-check.yml",
        render_yaml: || render_gh_workflow(docs_check::docs_check)(),
    },
    WorkflowFile {
        slug: "release",
        file_name: "release.yml",
        render_yaml: || render_gh_workflow(release::release)(),
    },
    WorkflowFile {
        slug: "publish_sdk",
        file_name: "publish-sdk.yml",
        render_yaml: || render_gh_workflow(publish_sdk::publish_sdk)(),
    },
];

/// Write every workflow to disk.
pub fn generate() -> Result<()> {
    let dir = workflows_dir()?;
    for workflow in WORKFLOWS {
        let path = dir.join(workflow.file_name);
        fs::write(&path, render(workflow)?)
            .with_context(|| format!("writing {}", path.display()))?;
        println!("generated {}", path.display());
    }
    Ok(())
}

/// Fail if any committed workflow differs from what we'd generate now.
pub fn check() -> Result<()> {
    let dir = workflows_dir()?;
    let mut stale = Vec::new();
    for workflow in WORKFLOWS {
        let path = dir.join(workflow.file_name);
        let on_disk =
            fs::read_to_string(&path).with_context(|| format!("reading {}", path.display()))?;
        if on_disk != render(workflow)? {
            stale.push(workflow.file_name.to_string());
        }
    }
    if !stale.is_empty() {
        bail!(
            "generated workflows are stale: {}\nrun `cargo x workflows` from the repository root and commit the result",
            stale.join(", ")
        );
    }
    println!("all generated workflows are up to date");
    Ok(())
}

/// Serialize a workflow to YAML and prepend the "do not edit" header.
fn render(workflow: &WorkflowFile) -> Result<String> {
    let yaml =
        (workflow.render_yaml)().with_context(|| format!("serializing {}", workflow.file_name))?;
    path_validation::validate(workflow.file_name, &yaml, &xtask_paths::repo_root())?;
    Ok(format!("{}{yaml}", disclaimer(workflow.slug)))
}

/// The header every generated file starts with.
fn disclaimer(source: &str) -> String {
    format!(
        "# DO NOT EDIT — regenerate with `cargo x workflows` (from the repository root).\n\
         # Source: tooling/xtask/crates/xtask_workflows/src/workflows/{source}.rs\n",
    )
}

/// `<repo-root>/.github/workflows`. Anchored on the repo root (from
/// [`xtask_paths`]) so the task works from any cwd.
fn workflows_dir() -> Result<PathBuf> {
    let dir = xtask_paths::repo_root().join(".github").join("workflows");
    if !dir.is_dir() {
        bail!("expected a workflows directory at {}", dir.display());
    }
    Ok(dir)
}
