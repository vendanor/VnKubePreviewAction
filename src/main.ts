import * as core from '@actions/core';
import { CommandResult, Options, validateOptions } from './common';
import { removePreviewsForCurrentPullRequest } from './remove-preview';
import { deployPreview } from './deploy-preview';
import { dilbert } from './dilbert';
import { postOrUpdateGithubComment } from './sticky-comment';
import { getCurrentPullRequestId } from './github-util';
import { generateHash } from './crypto-util';

const setOutputFromResult = (result: CommandResult) => {
  if (result.previewUrl) {
    core.setOutput('preview-url', result.previewUrl);
  }
  if (result.dockerImageVersion) {
    core.setOutput('docker-image-version', result.dockerImageVersion);
  }
  if (result.helmReleaseName) {
    core.setOutput('helm-release-name', result.helmReleaseName);
  }
  core.setOutput('success', result.success);
};

async function run(): Promise<void> {
  const options: Options = {
    cmd: core.getInput('command', { required: true }),
    appName: core.getInput('app-name'),
    helmNamespace: core.getInput('helm-namespace'),
    githubToken: core.getInput('token'),
    dockerImageName: core.getInput('docker-image-name'),
    dockerRegistry: core.getInput('docker-registry'),
    dockerOrganization: core.getInput('docker-organization'),
    dockerTagMajor: core.getInput('docker-tag-major'),
    dockerFile: core.getInput('docker-file'),
    dockerUsername: core.getInput('docker-username'),
    dockerPassword: core.getInput('docker-password'),
    dockerPullSecret: core.getInput('docker-pullsecret'),
    hashSalt: core.getInput('hash-salt'),
    helmTagMajor: core.getInput('helm-tag-major'),
    helmChartFilePath: core.getInput('helm-chart'),
    helmRepoUrl: core.getInput('helm-repo-url'),
    helmOrganization: core.getInput('helm-organization'),
    baseUrl: core.getInput('base-url'),
    helmRepoUsername: core.getInput('helm-repo-user'),
    helmRepoPassword: core.getInput('helm-repo-password'),
    helmKeyAppName: core.getInput('helm-key-appname'),
    helmKeyContainerSuffix: core.getInput('helm-key-containersuffix'),
    helmKeyImage: core.getInput('helm-key-image'),
    helmKeyPullSecret: core.getInput('helm-key-pullsecret'),
    helmKeyUrl: core.getInput('helm-key-url'),
    helmKeyNamespace: core.getInput('helm-key-namespace'),
    helmRemovePreviewCharts: core.getInput('helm-remove-preview-charts'),
    helmKeyTlsSecretName: core.getInput('helm-key-tls-secret-name'),
    helmKeyClusterIssuer: core.getInput('helm-key-cluster-issuer'),
    clusterIssuer: core.getInput('cluster-issuer'),
    TlsSecretName: core.getInput('tls-secret-name'),
    dockerRemovePreviewImages: core.getInput('docker-remove-preview-images')
  };

  try {
    core.info('🕵️ Running Vendanor Kube Preview Action 🕵️');
    core.info(dilbert);
    if (options.cmd === 'deploy') {
      validateOptions(options, 'deploy', [
        'appName',
        'dockerUsername',
        'dockerPassword',
        'dockerRegistry',
        'dockerOrganization',
        'githubToken',
        'dockerTagMajor',
        'helmTagMajor',
        'helmChartFilePath',
        'hashSalt'
      ]);
      const result = await deployPreview(options);
      setOutputFromResult(result);
      await postOrUpdateGithubComment('success', options, result.previewUrl);
    } else if (options.cmd === 'notify') {
      validateOptions(options, 'notify', [
        'githubToken',
        'hashSalt',
        'appName',
        'baseUrl'
      ]);
      const pullRequestId = await getCurrentPullRequestId(options.githubToken);
      const hash = generateHash(pullRequestId, options.hashSalt);
      const previewUrlIdentifier = `${options.appName}-${pullRequestId}-${hash}`;
      const completePreviewUrl = `${previewUrlIdentifier}.${options.baseUrl}`;
      await postOrUpdateGithubComment('brewing', options, completePreviewUrl);
      setOutputFromResult({
        success: true
      });
    } else if (options.cmd === 'remove') {
      validateOptions(options, 'remove', [
        'githubToken',
        'helmNamespace',
        'appName'
      ]);
      const result = await removePreviewsForCurrentPullRequest(options);
      setOutputFromResult(result);
      await postOrUpdateGithubComment('removed', options);
    } else {
      throw new Error(`Command ${options.cmd} not supported`);
    }
    core.info('🍺🍺🍺 GREAT SUCCESS - very nice 🍺🍺🍺');
  } catch (error) {
    await postOrUpdateGithubComment('fail', options);
    setOutputFromResult({
      success: false
    });
    core.error(error);
    core.setFailed(error.message);
  }
}

run();
