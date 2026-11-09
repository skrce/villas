import { fileURLToPath } from 'node:url';

export function validateChecksRun(run, workflowId, source) {
  if (!run || run.repository?.full_name !== 'skrce/villas' || run.head_repository?.full_name !== 'skrce/villas' ||
      run.head_sha !== source || run.head_branch !== 'master' || run.event !== 'push' ||
      run.workflow_id !== workflowId || run.path !== '.github/workflows/checks.yml' ||
      run.status !== 'completed' || run.conclusion !== 'success') {
    throw new Error('Select a successful master-push Checks run for this exact source revision.');
  }
}

export async function requireChecksRun(environment = process.env, request = fetch) {
  const id = environment.VILLAS_CHECKS_RUN_ID;
  const source = environment.GITHUB_SHA;
  if (!/^[1-9][0-9]*$/.test(id ?? '') || !/^[a-f0-9]{40}$/.test(source ?? '') ||
      environment.GITHUB_REPOSITORY !== 'skrce/villas' || environment.GITHUB_REF !== 'refs/heads/master' ||
      environment.GITHUB_EVENT_NAME !== 'workflow_dispatch' || !environment.GH_TOKEN) throw new Error('Use the Villas master release workflow with an exact Checks run.');
  const get = async path => {
    const response = await request(`https://api.github.com/repos/skrce/villas/actions/${path}`, {
      headers: { Authorization: `Bearer ${environment.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error('Cannot confirm the selected Checks run.');
    return response.json();
  };
  const workflow = await get('workflows/checks.yml');
  const run = await get(`runs/${id}`);
  validateChecksRun(run, workflow.id, source);
  return { id, source, url: run.html_url };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await requireChecksRun(); console.log('Exact-source master Checks run verified.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
