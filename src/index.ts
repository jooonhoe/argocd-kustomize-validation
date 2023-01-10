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
  await exec.exec("curl -O https://s3.us-west-2.amazonaws.com/amazon-eks/1.22.15/2022-10-31/bin/darwin/amd64/kubectl");
  await exec.exec("chmod +x ./kubectl");
  await fs.mkdir("/tmp/argocd-kustomize-validation", { recursive: true });
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
  core.debug(actions.payload.pull_request!["base"].toString());
  core.debug((compareData.data.files || []).toString());
  const detectedDirs = Array.from(new Set((compareData.data.files || [])
    .filter(file => file.status === 'modified' || file.status === 'changed')
    .map(file => path.dirname(file.filename))));
  core.debug(detectedDirs.toString());
  detectedDirs.forEach(async detectedDir => {
    await fsExtra.emptyDir("/tmp/argocd-kustomize-validation");
    const targetPaths = await fs.readdir(detectedDir);
    targetPaths.forEach(async (targetPath) => {

      const content = (await octokit.rest.repos.getContent({
        ...actions.repo,
        path: targetPath,
        ref: baseRef
      })).data as Content;

      const filename = content.name;
      await fs.writeFile(`/tmp/argocd-kustomize-validation/${path.basename(filename)}`, content.content || '');
    });
    const debugFiles = await fs.readdir("/tmp/argocd-kustomize-validation");
    debugFiles.forEach(async debugFile => {
      const content = await fs.readFile(debugFile);
      core.debug(content.toString());
      console.log(content.toString());
    });
    const baseKustomizationOutput = (await exec.getExecOutput('./kubectl kustomize --enable-helm /tmp/argocd-kustomize-validation')).stdout;
    const currKustomizationOutput = (await exec.getExecOutput(`./kubectl kustomize --enable-helm ${detectedDir}`)).stdout;
    console.log(baseKustomizationOutput);
    console.log(currKustomizationOutput);
  });
}

run();
