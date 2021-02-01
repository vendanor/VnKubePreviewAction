import {
  ChartListResult,
  Options,
  PREVIEW_TAG_PREFIX,
  validateOptions
} from './common';
import * as core from '@actions/core';
import axios from 'axios';

export async function removePreviewHelmCharts(
  pullRequestId: number,
  options: Options
) {
  core.info('Removing charts..');
  validateOptions(options, 'remove', [
    'helmRepoUrl',
    'helmRepoUsername',
    'helmRepoPassword',
    'appName'
  ]);

  const { helmRepoPassword, helmRepoUrl, helmRepoUsername, appName } = options;

  const regexCurrentVersion = new RegExp(
    `\\b${PREVIEW_TAG_PREFIX}.${pullRequestId}.\\b`
  );

  const url = `${helmRepoUrl}/api/charts/${appName}`;
  core.info('Get a list of all charts for app, url: ' + url);
  const allCharts = await axios.get<ChartListResult>(url, {
    auth: {
      username: helmRepoUsername,
      password: helmRepoPassword
    },
    responseType: 'json'
  });
  core.info(
    `Fetch list of charts: ${allCharts.status} - ${allCharts.statusText}`
  );

  // core.info('All charts');
  // core.info(JSON.stringify(allCharts.data, null, 2));

  const filteredCharts = allCharts.data.filter(
    c => c.name === appName && regexCurrentVersion.test(c.version)
  );

  // core.info('filtered charts to delete');
  // core.info(JSON.stringify(filteredCharts, null, 2));
  core.info(`Found ${filteredCharts.length} preview charts to delete`);

  for (let i = 0; i < filteredCharts.length; i++) {
    const { name, version } = filteredCharts[i];
    core.info(`Deleting chart ${version}`);
    const deleteResult = await axios.delete(
      `${helmRepoUrl}/api/charts/${name}/${version}`,
      {
        auth: {
          username: helmRepoUsername,
          password: helmRepoPassword
        },
        responseType: 'json'
      }
    );
    core.info(
      `Delete result: ${deleteResult.status} ${deleteResult.statusText}`
    );
  }

  core.info('Done deleting helm charts');
}
