//! `Release` — tags every successful push to `main` and attaches a source
//! archive to a GitHub Release so the repository state is not only in branch
//! history.

use gh_workflow::{Event, Job, Level, Permissions, Push, Run, Step, Workflow, WorkflowDispatch};

use crate::workflows::steps;

/// Build the workflow.
pub fn release() -> Workflow {
    Workflow::new("Release")
        .on(Event::default()
            .push(Push::default().add_branch("main"))
            .workflow_dispatch(WorkflowDispatch::default()))
        .permissions(Permissions {
            contents: Some(Level::Write),
            ..Default::default()
        })
        .add_job("release", release_job())
}

fn release_job() -> Job {
    Job::default()
        .name("Tag and publish release")
        // GitHub Release publication must use a runner available to this
        // repository. Namespace profile labels are not guaranteed to exist
        // on the public GitHub Actions pool and leave the job queued forever.
        .runs_on("ubuntu-latest")
        .add_step(steps::checkout(true, true))
        .add_step(tag_release())
        .add_step(package_release())
        .add_step(publish_release())
}

fn tag_release() -> Step<Run> {
    Step::new("Create release tag").run(indoc::indoc! {r#"
        set -euo pipefail

        mkdir -p release-artifacts
        tag="v$(date -u +%Y).$(date -u +%-m).$(date -u +%-d).${GITHUB_RUN_NUMBER}"
        if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
          :
        else
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git tag -a "$tag" -m "Automated release $tag"
          git push origin "$tag"
        fi

        printf '%s\n' "$tag" > release-artifacts/tag.txt
    "#})
}

fn package_release() -> Step<Run> {
    Step::new("Package source archive").run(indoc::indoc! {r#"
        set -euo pipefail

        tag="$(cat release-artifacts/tag.txt)"
        if [ -z "$tag" ]; then
          tag="v$(date -u +%Y).$(date -u +%-m).$(date -u +%-d).${GITHUB_RUN_NUMBER}"
        fi

        archive="release-artifacts/macro-source-${tag}.tar.gz"
        git archive --format=tar.gz --prefix="macro-${tag}/" -o "$archive" "$tag"

        printf 'Automated release for `%s`.\n\n- Commit: `%s`\n- Workflow run: `%s`\n- Source archive: `%s`\n' \
          "$tag" \
          "${GITHUB_SHA}" \
          "${GITHUB_RUN_ID}" \
          "$(basename "$archive")" > release-artifacts/release-notes.md
    "#})
}

fn publish_release() -> Step<Run> {
    Step::new("Publish GitHub Release")
        .run(indoc::indoc! {r#"
        set -euo pipefail

        tag="$(cat release-artifacts/tag.txt)"
        archive="release-artifacts/macro-source-${tag}.tar.gz"
        if gh release view "$tag" >/dev/null 2>&1; then
          gh release upload "$tag" "$archive" --clobber
          gh release edit "$tag" --title "$tag" --notes-file release-artifacts/release-notes.md
        else
          gh release create "$tag" "$archive" --title "$tag" --notes-file release-artifacts/release-notes.md --verify-tag
        fi
    "#})
        .add_env(("GH_TOKEN", "${{ github.token }}"))
}
