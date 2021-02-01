import * as core from '@actions/core';
import { GitHub, context } from '@actions/github/lib/utils';
import { Context } from '@actions/github/lib/context';
import { Repo } from './common';

// NOTE: mostly copy-paste from github action sticky pull request
function headerComment(header: string) {
  return `<!-- Sticky Pull Request Comment${header} -->`;
}

export async function findPreviousComment(
  token: string,
  repo: Repo,
  issue_number: number,
  header: string
) {
  const octokit = new GitHub({
    auth: token
  });

  const { data: comments } = await octokit.issues.listComments({
    ...repo,
    issue_number
  });
  const h = headerComment(header);
  return comments.find(comment => comment.body?.includes(h));
}

export async function updateComment(
  token: string,
  repo: Repo,
  comment_id: number,
  body: string,
  header: string,
  previousBody?: string
) {
  const octokit = new GitHub({
    auth: token
  });

  if (!body && !previousBody)
    return core.warning('Comment body cannot be blank');

  await octokit.issues.updateComment({
    ...repo,
    comment_id,
    body: previousBody
      ? `${previousBody}\n${body}`
      : `${body}\n${headerComment(header)}`
  });
}
export async function createComment(
  token: string,
  repo: Repo,
  issue_number: number,
  body: string,
  header: string,
  previousBody?: string
) {
  const octokit = new GitHub({
    auth: token
  });

  if (!body && !previousBody)
    return core.warning('Comment body cannot be blank');

  await octokit.issues.createComment({
    ...repo,
    issue_number,
    body: previousBody
      ? `${previousBody}\n${body}`
      : `${body}\n${headerComment(header)}`
  });
}
export async function deleteComment(
  token: string,
  repo: Repo,
  comment_id: number
) {
  const octokit = new GitHub({
    auth: token
  });

  await octokit.issues.deleteComment({
    ...repo,
    comment_id
  });
}

export const getCurrentContext = async (): Promise<Context> => {
  return context;
};

export const getBase = async (
  token: string,
  prId: number
): Promise<{ ref: string; sha: string }> => {
  const client = new GitHub({
    auth: token
  });

  const pr = await client.pulls.get({
    repo: context.repo.repo,
    owner: context.repo.owner,
    pull_number: prId
  });

  return {
    ref: pr.data.base.ref,
    sha: pr.data.base.sha
  };
};

export const getCurrentPullRequestId = async (
  token: string
): Promise<number> => {
  core.info('Getting current pull request id...');
  const client = new GitHub({
    auth: token
  });

  // In the context of github PUSH, we don't have access to PR info in context
  // NOTE: this part is not tested..
  if (context.eventName === 'push' && !!context.sha) {
    const result = await client.repos.listPullRequestsAssociatedWithCommit({
      owner: context.repo.owner,
      repo: context.repo.repo,
      commit_sha: context.sha
    });

    return result.data[0].number;
  } else if (context.eventName === 'pull_request') {
    // .pull_request only exists in the context of a pull request action!
    if (
      context.payload.pull_request === undefined ||
      context.payload.pull_request.number === undefined
    ) {
      throw new Error('Could not find pull request id from context');
    }
    return context.payload.pull_request.number;
  } else {
    throw new Error('Can only run on commit or pull_request');
  }
};

export const getLatestCommitShortSha = async (token: string) => {
  // we need sha of latest commit
  const client = new GitHub({
    auth: token
  });

  const prId = await getCurrentPullRequestId(token);

  core.info(
    `Finding last commit sha for PR ${prId}, repoOwner ${context.repo.owner} repoName ${context.repo.repo}`
  );

  let pageNumber = 1;
  let totalCount = 0;
  let lastCommit;

  while (true) {
    const result = await client.pulls.listCommits({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: prId,
      per_page: 100,
      page: pageNumber
    });

    const length = result.data.length;
    if (length < 1) {
      break;
    } else {
      totalCount += length;
      lastCommit = result.data[length - 1];
    }

    if (length < 100) {
      break;
    }
    pageNumber++;
  }

  if (!!lastCommit) {
    core.info(
      `Found ${totalCount} commits on PR ${prId}. Last commit sha7: ${lastCommit.sha.substring(
        0,
        7
      )}`
    );
    return lastCommit.sha.substring(0, 7);
  }
};
