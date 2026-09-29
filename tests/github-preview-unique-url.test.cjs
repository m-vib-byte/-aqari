const test = require('node:test');
const assert = require('node:assert/strict');

const env = {
  AQARI_EXPECTED_SHA: 'a'.repeat(40),
  GITHUB_REPOSITORY: 'm-vib-byte/-aqari',
  GITHUB_TOKEN: 'synthetic-github-token',
  AQARI_PROJECT_SLUG: 'aqari',
  AQARI_TEAM_SLUG: 'm-vib-5421',
  GITHUB_API_URL: 'https://api.github.com'
};

const jsonResponse = (value, status = 200) => ({
  status,
  text: async () => JSON.stringify(value)
});

test('unique Vercel host is accepted only for explicit Preview deployment metadata', async () => {
  const { resolveGitHubPreviewDeploymentUrl } = await import('./github-preview-oidc.mjs');
  const unique = 'https://aqari-n0d7vkoik-m-vib-5421.vercel.app';
  const resolved = await resolveGitHubPreviewDeploymentUrl({
    env,
    fetchApi: async url => url.pathname.endsWith('/deployments')
      ? jsonResponse([{ sha: env.AQARI_EXPECTED_SHA, environment: 'Preview', production_environment: false, statuses_url: 'https://api.github.com/repos/m-vib-byte/-aqari/deployments/7/statuses' }])
      : jsonResponse([{ environment_url: unique }])
  });
  assert.equal(resolved, unique + '/');

  await assert.rejects(
    resolveGitHubPreviewDeploymentUrl({
      env,
      fetchApi: async url => url.pathname.endsWith('/deployments')
        ? jsonResponse([{ sha: env.AQARI_EXPECTED_SHA, environment: 'Production', production_environment: true, statuses_url: 'https://api.github.com/repos/m-vib-byte/-aqari/deployments/8/statuses' }])
        : jsonResponse([{ environment_url: unique }])
    }),
    /Preview URL is invalid or non-Preview/
  );
});
