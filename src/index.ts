import { promises as fs } from "fs";
import * as fsExtra from "fs-extra";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { context, getOctokit } from "@actions/github";
import { GitHub } from "@actions/github/lib/utils";
import path from "path";

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

async function run() {
  const { actions, octokit } = prepareContext(context);
  await buildEnv();
  const compareData = await octokit.rest.repos.compareCommits({
    ...actions.repo,
    base: actions.payload.pull_request!["base"]["sha"],
    head: actions.sha
  });
  const baseRef = actions.payload.pull_request!["base"]["ref"];
  // core.info(JSON.stringify(actions.payload.pull_request!["base"]));
  // core.info((compareData.data.files || []).map(fileObj => JSON.stringify(fileObj)).toString());
  const detectedDirs = Array.from(new Set((compareData.data.files || [])
    .filter(file => file.status === 'modified' || file.status === 'changed')
    .map(file => path.dirname(file.filename))));
  core.info(detectedDirs.toString());
  for (let detectedDir of detectedDirs) {
    await fsExtra.emptyDir("/tmp/resources");
    const targetPaths = await fs.readdir(detectedDir);
    await Promise.all(targetPaths.map(async (targetPath) => {

      const content = (await octokit.rest.repos.getContent({
        ...actions.repo,
        path: path.join(detectedDir, targetPath),
        ref: baseRef
      })).data as Content;
      const decoded = Buffer.from(content.content || '', "base64").toString("utf8");
      const filename = content.name;
      await fs.writeFile(`/tmp/resources/${path.basename(filename)}`, decoded);
    }));
    const debugFiles = await fs.readdir("/tmp/resources");
    core.info(`Debug Files(${detectedDir}): ${debugFiles}`);
    await Promise.all(debugFiles.map(async debugFile => {
      const content = await fs.readFile(path.join(`/tmp/resources/${debugFile}`));
      core.info(content.toString());
    }));
    let errorCaptured = false;
    const baseKustomizationOutput = await exec.getExecOutput('./kubectl kustomize --enable-helm /tmp/resources')
    await fs.writeFile("/tmp/kustomization-results/1.yaml", baseKustomizationOutput.stdout);
    try {
      const currKustomizationOutput = await exec.getExecOutput(`./kubectl kustomize --enable-helm ${detectedDir}`);
      await fs.writeFile("/tmp/kustomization-results/2.yaml", currKustomizationOutput.stdout);
    } catch (error) {
      errorCaptured = true;
      await octokit.rest.issues.createComment({
        issue_number: actions.issue.number,
        ...actions.repo,
        body: `
        Kustomize build error in ${detectedDir}
        ---
        \`\`\`
        ${(error as Error).message}
        \`\`\`
      `
      });
    }

    if (!errorCaptured) {
      const diffOutput = await exec.getExecOutput('diff -u /tmp/kustomization-results/1.yaml /tmp/kustomization-results/2.yaml');
      await octokit.rest.issues.createComment({
        issue_number: actions.issue.number,
        ...actions.repo,
        body: `
        Differences of Kustomize built results in ${detectedDir}
        ---
        \`\`\`diff
        ${diffOutput.stdout}
        \`\`\`
      `
      });
    }
  }
}

run();
