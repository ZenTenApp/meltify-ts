/**
 * semantic-release configuration for meltify-ts.
 *
 * Conventional Commits decide the version: `feat` → minor, `fix` → patch, a
 * breaking change → major, anything else → no release at all. The static site
 * under site/dist/ is deployed by .github/workflows/release.yml *before* the
 * release is published, so a tag never points at something that failed to land
 * on the server.
 *
 * `changelog` and `git` are the only plugins that are not bundled with
 * semantic-release itself, so those two are the ones release.yml has to list in
 * `extra_plugins`. Keep the two lists in lockstep: a plugin named here but
 * missing there fails config load.
 */
module.exports = {
  branches: ['master'],
  tagFormat: 'v${version}',
  plugins: [
    '@semantic-release/commit-analyzer',
    '@semantic-release/release-notes-generator',
    ['@semantic-release/changelog', { changelogFile: 'CHANGELOG.md' }],
    // The package is private and never published to a registry; this plugin is
    // here only so package.json carries the version that was tagged.
    ['@semantic-release/npm', { npmPublish: false }],
    [
      '@semantic-release/github',
      {
        // Matches the tarball staged in release.yml, so the exact tree that was
        // deployed is attached to the Release.
        assets: [{ path: 'meltify-v*.tar.gz', label: 'meltify static bundle' }],
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'CHANGELOG.md'],
        // `[skip ci]` keeps the release commit from starting another release.
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
  ],
};
