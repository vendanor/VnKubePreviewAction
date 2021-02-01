import * as core from '@actions/core';
import {
  GraphQlResponse,
  RequestParameters
} from '@octokit/graphql/dist-types/types';
import { GitHub, context } from '@actions/github/lib/utils';
import { Options, PREVIEW_TAG_PREFIX } from './common';

export async function query<ResponseData = any>(
  token: string,
  query: string,
  parameters: RequestParameters
): Promise<GraphQlResponse<ResponseData>> {
  const octokit = new GitHub({
    auth: token
  });
  return await octokit.graphql<ResponseData>(query, parameters);
}

export interface DeletePackageVersionMutationResponse {
  deletePackageVersion: {
    success: boolean;
  };
}

const mutation = `
  mutation deletePackageVersion($packageVersionId: String!) {
      deletePackageVersion(input: {packageVersionId: $packageVersionId}) {
          success
      }
  }`;

// copy from (except rxjs):
// https://github.com/actions/delete-package-versions/blob/35f1b743a143bad14da97a62245ebb87c046c1e1/src/version/delete-version.ts
export async function deletePackageVersion(
  packageVersionId: string,
  token: string
): Promise<boolean> {
  try {
    const result = await query<DeletePackageVersionMutationResponse>(
      token,
      mutation,
      {
        headers: {
          Accept: 'application/vnd.github.package-deletes-preview+json'
        }
      }
    );
    return result.deletePackageVersion.success;
  } catch (err) {
    core.error(err);
    return false;
  }
}

export interface VersionInfo {
  id: string;
  version: string;
}

export interface GetVersionsQueryResponse {
  repository: {
    packages: {
      edges: {
        node: {
          name: string;
          versions: {
            edges: { node: VersionInfo }[];
          };
        };
      }[];
    };
  };
}

const queryVersions = `
  query getVersions($owner: String!, $repo: String!, $package: String!, $last: Int!) {
    repository(owner: $owner, name: $repo) {
      packages(first: 1, names: [$package]) {
        edges {
          node {
            name
            versions(last: $last) {
              edges {
                node {
                  id
                  version
                }
              }
            }
          }
        }
      }
    }
  }`;

export async function queryForOldestVersions(
  owner: string,
  repo: string,
  packageName: string,
  numVersions: number,
  token: string
): Promise<GetVersionsQueryResponse> {
  const result = await query<GetVersionsQueryResponse>(token, queryVersions, {
    owner,
    repo,
    package: packageName,
    last: numVersions,
    headers: {
      Accept: 'application/vnd.github.packages-preview+json'
    }
  });

  return result;
}

export async function getOldestVersions(
  owner: string,
  repo: string,
  packageName: string,
  numVersions: number,
  token: string
): Promise<VersionInfo[]> {
  const result = await queryForOldestVersions(
    owner,
    repo,
    packageName,
    numVersions,
    token
  );

  if (result.repository.packages.edges.length < 1) {
    throw new Error(
      `package: ${packageName} not found for owner: ${owner} in repo: ${repo}`
    );
  }

  const versions = result.repository.packages.edges[0].node.versions.edges;

  if (versions.length !== numVersions) {
    core.info(
      `number of versions requested was: ${numVersions}, but found: ${versions.length}`
    );
  }

  return versions
    .map(value => ({ id: value.node.id, version: value.node.version }))
    .reverse();
}

export async function removePreviewDockerImages(
  pullRequestId: number,
  options: Options
) {
  const regexCurrentVersion = new RegExp(
    `\\b${PREVIEW_TAG_PREFIX}.${pullRequestId}.\\b`
  );

  // Get a list of all matching images
  core.info(`Deleting docker preview images for PR ${pullRequestId}...`);
  const repository = context.repo.repo;
  core.info('Getting list of versions in ' + repository);
  const list = await getOldestVersions(
    options.dockerUsername,
    `${options.dockerOrganization}${repository}`,
    options.dockerImageName,
    1, // ???
    options.githubToken
  );
  core.info(list.join('\n'));

  const filtered = list.filter(c => regexCurrentVersion.test(c.version));

  core.info(
    `Found ${list.length} versions where ${filtered.length} matched version to delete.`
  );
  core.info(filtered.join('\n'));
  for (let i = 0; i < filtered.length; i++) {
    core.info('fake delete: ' + filtered[i].version);

    // TODO: lets test logic before we start to delete stuff :)
    const deleteResult = await deletePackageVersion(
      filtered[i].id,
      options.githubToken
    );
  }

  core.info('Done deleting');
}

/**
 GHCR - Github Container Registry

 */
