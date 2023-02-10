import { promises as fs } from "fs";
import * as fsExtra from "fs-extra";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { GitHub } from "@actions/github/lib/utils";
import * as pathlib from "path";

type Context = typeof context;

type CustomContext = {
  actions: Context,
  octokit: InstanceType<typeof GitHub>
};

type Content = {
  type: string;
  size: number;
  name: string;
  path: string;
  content?: string | undefined;
  sha: string;
  url: string;
  git_url: string | null;
  html_url: string | null;
  download_url: string | null;
  _links: object
};

function prepareContext(ctx: Context): CustomContext {
  return {
    actions: ctx,
    octokit: getOctokit(core.getInput("github-token", { required: true }))
  };
}

async function buildEnv() {
  await exec.exec("curl -LO \"https://dl.k8s.io/release/v1.26.0/bin/linux/amd64/kubectl\"");
  await exec.exec("chmod +x ./kubectl");
  await exec.exec("curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3");
  await exec.exec("chmod 700 get_helm.sh");
  await exec.exec("./get_helm.sh");
  await fs.mkdir("/tmp/resources", { recursive: true });
  await fs.mkdir("/tmp/kustomization-results", { recursive: true });
}

async function copyFromBaseRef(actions: Context, octokit: InstanceType<typeof GitHub>, parent: string, path: string) {
  const baseRef = actions.payload.pull_request!["base"]["ref"];
  const fullPath = pathlib.join(parent, path);
  if ((await fs.lstat(fullPath)).isDirectory()) {
    const newParent = fullPath;
    const subPaths = await fs.readdir(newParent);
    await Promise.all(subPaths.map((subPath) => copyFromBaseRef(actions, octokit, newParent, subPath)));
  }
  const content = (await octokit.rest.repos.getContent({
    ...actions.repo,
    path: fullPath,
    ref: baseRef
  })).data as Content;
  const decoded = Buffer.from(content.content || '', "base64").toString("utf8");
  await fs.writeFile(`/tmp/resources/${pathlib.basename(content.name)}`, decoded);
}

async function run() {
  const { actions, octokit } = prepareContext(context);

  await buildEnv();

  const compareData = await octokit.rest.repos.compareCommits({
    ...actions.repo,
    base: actions.payload.pull_request!["base"]["sha"],
    head: actions.payload.pull_request!["head"]["sha"]
  });
  const detectedDirs = Array.from(new Set((compareData.data.files || [])
    .filter(file => file.status === 'modified' || file.status === 'changed')
    .filter(file => file.filename.startsWith('deploy/'))
    .map(file => pathlib.dirname(file.filename))));

  for (let detectedDir of detectedDirs) {
    await fsExtra.emptyDir("/tmp/resources");

    const targetPaths = await fs.readdir(detectedDir);

    if (!targetPaths.includes('kustomization.yaml')) {
      continue;
    }

    core.info(`Compare differences between Kustomization build output in "${detectedDir}".`);

    try {
      await Promise.all(targetPaths.map(targetPath => copyFromBaseRef(actions, octokit, detectedDir, targetPath)));
    } catch (e) {
      await octokit.rest.issues.createComment({
        issue_number: actions.issue.number,
        ...actions.repo,
        body: `⚠️Kustomize build error in \`${detectedDir}\`:\n\`\`\`\n${e as Error}\n\`\`\``
      });
      continue;
    }

    const baseKustomizationOutput = await exec.getExecOutput(
      './kubectl kustomize --enable-helm /tmp/resources',
      undefined, { silent: true, ignoreReturnCode: true });
    if (baseKustomizationOutput.exitCode === 0) {
      await fs.writeFile("/tmp/kustomization-results/1.yaml", baseKustomizationOutput.stdout);
    } else {
      core.error('Error occured in base branch');
      core.error(baseKustomizationOutput.stderr);
      continue;
    }

    const currKustomizationOutput = await exec.getExecOutput(
      `./kubectl kustomize --enable-helm ${detectedDir}`,
      undefined, { silent: true, ignoreReturnCode: true });
    if (currKustomizationOutput.exitCode === 0) {
      await fs.writeFile("/tmp/kustomization-results/2.yaml", currKustomizationOutput.stdout);
    } else {
      await octokit.rest.issues.createComment({
        issue_number: actions.issue.number,
        ...actions.repo,
        body: `⚠️Kustomize build error in \`${detectedDir}\`:\n\`\`\`\n${currKustomizationOutput.stderr}\n\`\`\``
      });
      continue;
    }

    const diffOutput = await exec.getExecOutput(
      'diff -U 100000 /tmp/kustomization-results/1.yaml /tmp/kustomization-results/2.yaml',
      undefined, { silent: true, ignoreReturnCode: true });
    await octokit.rest.issues.createComment({
      issue_number: actions.issue.number,
      ...actions.repo,
      body: `Differences of Kustomize built results in \`${detectedDir}\`:\n\`\`\`diff\n${diffOutput.stdout}\n\`\`\``
    });
  }
}

run();
