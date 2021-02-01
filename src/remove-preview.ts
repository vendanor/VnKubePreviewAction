import { CommandResult, HelmListResult, Options } from './common';
import * as core from '@actions/core';
import { runCmd } from './run-cmd';
import { getCurrentPullRequestId } from './github-util';
import { removePreviewHelmCharts } from './remove-preview-helm-charts';
import { removePreviewDockerImages } from './remove-preview-docker-images';

export const removePreviewsForCurrentPullRequest = async (
  options: Options
): Promise<CommandResult> => {
  const {
    appName,
    githubToken,
    helmNamespace,
    helmRemovePreviewCharts
  } = options;

  const pullRequestId = await getCurrentPullRequestId(githubToken);
  const shouldRemoveCharts: boolean =
    helmRemovePreviewCharts.toLowerCase() === 'true';

  core.info(`Removing previews for pull request ${pullRequestId}...`);
  const cmdResult = await runCmd('helm', [
    'list',
    '--namespace',
    helmNamespace,
    '--filter',
    `preview-${appName}-${pullRequestId}`,
    '--output',
    'json'
  ]);
  core.info('Helm list result: ' + cmdResult.resultCode);
  core.info(cmdResult.output);
  const json = JSON.parse(cmdResult.output) as HelmListResult;

  for (let index = 0; index < json.length; index++) {
    const release = json[index];
    core.info(
      `Removing release ${release.name} (${release.app_version}) from Kubernetes`
    );
    const removeResult = await runCmd('helm', [
      'uninstall',
      release.name,
      '--namespace',
      helmNamespace
    ]);
    if (removeResult.resultCode === 0) {
      core.info(removeResult.output);
    } else {
      core.error(removeResult.output);
    }
  }

  if (shouldRemoveCharts) {
    await removePreviewHelmCharts(pullRequestId, options);
  } else {
    core.info('Skip removing Helm preview charts..');
  }

  if (options.dockerRemovePreviewImages.toLowerCase() === 'true') {
    // await removePreviewDockerImages(pullRequestId, options);
    core.warning(
      'Skip removing docker preview images, not supported by GHCR.io yet!'
    );
  } else {
    core.info('Skip removing docker preview images.');
  }

  core.info(`All previews for app ${appName} deleted successfully!`);

  return {
    success: true
  };
};
