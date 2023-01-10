// import { promises as fs } from "fs";
// import * as core from "@actions/core";
// import * as exec from "@actions/exec";
// import { context, getOctokit } from "@actions/github";
// import * as yaml from "js-yaml";

// type Context = typeof context;

// type CustomContext = {
//   actions: Context,
//   chartmuseum: {
//     url: string,
//     username: string,
//     password: string,
//   },
// };

// function prepareContext(ctx: Context): CustomContext {
//   return {
//     actions: ctx,
//     chartmuseum: {
//       url: core.getInput("chartmuseum-url", { required: true }),
//       username: core.getInput("chartmuseum-username", { required: true }),
//       password: core.getInput("chartmuseum-password", { required: true }),
//     },
//   };
// }

// async function buildEnv() {
//   await exec.exec("curl -s \"https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh\" | bash");
//   console.log("Kustomize download is complete.");
// }

// async function run() {
//   const { actions, chartmuseum } = prepareContext(context);
//   await buildEnv();
//   const kustomization = {
//     helmCharts: [{
//       repo: "https://chartmuseum.util.riiid.cloud",
//       name: "toeic-speaking-api",
//       version: "0.3.1",
//       includeCRDs: true,
//       namespace: "toeic-speaking-api",
//       releaseName: "toeic-speaking-api",
//       valuesFile: "helm.toeic-speaking-api.yaml"
//     }]
//   }

//   const values = {
//     env: "stg",
//     project: "toeic",
//     component: "speaking-api",
//     image: {
//       registry: "165167487431.dkr.ecr.ap-northeast-1.amazonaws.com",
//       repository: "toeic-speaking-api",
//       tag: "develop_2b53b1c_2022-12-27-09.14.56"
//     },
//     serviceAccount: {
//       iamRoleARN: "arn:aws:iam::888926908131:role/toeic-speaking-api-v2"
//     },
//     resources: {
//       requests: {
//         memory: "1Gi",
//         cpu: "100m",
//       },
//       limits: {
//         memory: "1Gi"
//       }
//     },
//     endpoints: {
//       public: [
//         {
//           host: "toeic-speaking-api.stg.riiid.cloud",
//           exposedPort: 443,
//           targetPort: 8080,
//           containerPort: 8080,
//           appProtocol: "http"
//         },
//       ],
//       internal: [
//         {
//           host: "toeic-speaking-api-internal.stg.riiid.cloud",
//           exposedPort: 443,
//           targetPort: 8080,
//           containerPort: 8080,
//           appProtocol: "http"
//         },
//       ]
//     }
//   }

//   await fs.writeFile('kustomization.yaml', yaml.dump(kustomization));
//   await fs.writeFile('helm.toeic-speaking-api.yaml', yaml.dump(values));
//   console.log('Writing mock files is complete');

//   const output = await exec.getExecOutput('kubectl kustomize . --enable-helm');
//   console.log(output.stdout);

//   if (output.exitCode !== 0) {
//     core.setFailed(output.stderr);
//   }
// }

// run();

async function run() {
  console.log('hello world!');
};

run();
