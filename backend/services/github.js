'use strict';
const fetch = require('node-fetch');

const GITHUB_API = 'https://api.github.com';
const SERVER_TOKEN = process.env.GITHUB_TOKEN;

function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token || SERVER_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'DevCollab-Hub/2.0',
  };
}

async function ghFetch(path, options={}, token=null) {
  const url = path.startsWith('http') ? path : GITHUB_API + path;
  const res = await fetch(url, { ...options, headers: { ...ghHeaders(token), ...options.headers } });
  if (!res.ok) {
    const err = await res.json().catch(()=>({}));
    throw new Error(err.message || `GitHub API error ${res.status}`);
  }
  return res.json();
}

// OAuth
async function exchangeCode(code) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept:'application/json', 'Content-Type':'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: process.env.GITHUB_CALLBACK_URL,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description || data.error);
  return data.access_token;
}

async function getAuthUser(token) { return ghFetch('/user', {}, token); }
async function getAuthUserEmails(token) { return ghFetch('/user/emails', {}, token); }

// Repos
async function getUserRepos(token, page=1) {
  return ghFetch(`/user/repos?visibility=all&affiliation=owner,collaborator&sort=updated&per_page=50&page=${page}`, {}, token);
}
async function getRepo(owner, repo, token) { return ghFetch(`/repos/${owner}/${repo}`, {}, token); }
async function createRepo(name, description, isPrivate, token) {
  return ghFetch('/user/repos', { method:'POST', body: JSON.stringify({name,description,private:isPrivate,auto_init:true}) }, token);
}
async function getRepoContents(owner, repo, path='', ref='main', token) {
  return ghFetch(`/repos/${owner}/${repo}/contents/${path}?ref=${ref}`, {}, token);
}
async function getFileContent(owner, repo, path, ref='main', token) {
  const data = await ghFetch(`/repos/${owner}/${repo}/contents/${path}?ref=${ref}`, {}, token);
  const content = Buffer.from(data.content, 'base64').toString('utf8');
  return { ...data, decoded_content: content };
}
async function createOrUpdateFile(owner, repo, path, content, message, sha, branch, token) {
  return ghFetch(`/repos/${owner}/${repo}/contents/${path}`, {
    method:'PUT',
    body: JSON.stringify({
      message, content: Buffer.from(content).toString('base64'),
      branch, ...(sha ? {sha} : {}),
    }),
  }, token);
}
async function getBranches(owner, repo, token) { return ghFetch(`/repos/${owner}/${repo}/branches?per_page=50`, {}, token); }
async function createBranch(owner, repo, branchName, fromSha, token) {
  return ghFetch(`/repos/${owner}/${repo}/git/refs`, {
    method:'POST', body: JSON.stringify({ ref:`refs/heads/${branchName}`, sha:fromSha }),
  }, token);
}
async function deleteBranch(owner, repo, branch, token) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`, { method:'DELETE', headers:ghHeaders(token) });
  return res.ok;
}
async function getCommits(owner, repo, branch='main', perPage=20, token) {
  return ghFetch(`/repos/${owner}/${repo}/commits?sha=${branch}&per_page=${perPage}`, {}, token);
}
async function getContributions(username, token) {
  // GitHub contribution data via search API
  return ghFetch(`/search/commits?q=author:${username}&sort=author-date&per_page=1`, {
    headers: { Accept:'application/vnd.github.cloak-preview' }
  }, token);
}
async function getContributionStats(owner, repo, token) {
  return ghFetch(`/repos/${owner}/${repo}/stats/contributors`, {}, token);
}

// Pull Requests
async function getPRs(owner, repo, state='open', token) {
  return ghFetch(`/repos/${owner}/${repo}/pulls?state=${state}&per_page=30`, {}, token);
}
async function getPR(owner, repo, number, token) {
  return ghFetch(`/repos/${owner}/${repo}/pulls/${number}`, {}, token);
}
async function createPR(owner, repo, title, body, head, base, token) {
  return ghFetch(`/repos/${owner}/${repo}/pulls`, {
    method:'POST', body: JSON.stringify({title, body, head, base}),
  }, token);
}
async function approvePR(owner, repo, number, token) {
  return ghFetch(`/repos/${owner}/${repo}/pulls/${number}/reviews`, {
    method:'POST', body: JSON.stringify({event:'APPROVE'}),
  }, token);
}
async function requestChanges(owner, repo, number, body, token) {
  return ghFetch(`/repos/${owner}/${repo}/pulls/${number}/reviews`, {
    method:'POST', body: JSON.stringify({event:'REQUEST_CHANGES', body}),
  }, token);
}
async function mergePR(owner, repo, number, commitTitle, token) {
  return ghFetch(`/repos/${owner}/${repo}/pulls/${number}/merge`, {
    method:'PUT', body: JSON.stringify({commit_title:commitTitle, merge_method:'squash'}),
  }, token);
}
async function getPRDiff(owner, repo, number, token) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${number}`, {
    headers: { ...ghHeaders(token), Accept:'application/vnd.github.diff' }
  });
  return res.text();
}
async function commentOnPR(owner, repo, number, body, token) {
  return ghFetch(`/repos/${owner}/${repo}/issues/${number}/comments`, {
    method:'POST', body: JSON.stringify({body}),
  }, token);
}
async function addLineComment(owner, repo, number, body, path, line, commitId, token) {
  return ghFetch(`/repos/${owner}/${repo}/pulls/${number}/comments`, {
    method:'POST', body: JSON.stringify({body,path,line,commit_id:commitId,subject_type:'line'}),
  }, token);
}

// Webhooks
async function createWebhook(owner, repo, url, secret, token) {
  return ghFetch(`/repos/${owner}/${repo}/hooks`, {
    method:'POST',
    body: JSON.stringify({
      name:'web', active:true,
      events:['push','pull_request','pull_request_review','create','delete','issues'],
      config:{ url, content_type:'json', secret },
    }),
  }, token);
}
async function deleteWebhook(owner, repo, hookId, token) {
  const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/hooks/${hookId}`, { method:'DELETE', headers:ghHeaders(token) });
  return res.ok;
}

module.exports = {
  exchangeCode, getAuthUser, getAuthUserEmails,
  getUserRepos, getRepo, createRepo,
  getRepoContents, getFileContent, createOrUpdateFile,
  getBranches, createBranch, deleteBranch,
  getCommits, getContributions, getContributionStats,
  getPRs, getPR, createPR, approvePR, requestChanges, mergePR, getPRDiff, commentOnPR, addLineComment,
  createWebhook, deleteWebhook,
};
