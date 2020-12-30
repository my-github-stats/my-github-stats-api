require('dotenv').config();

const express = require('express');
const app = express();

const fetch = require('node-fetch');

const { graphql } = require('@octokit/graphql');
const graphqlWithAuth = graphql.defaults({
    headers: {
        authorization: `token ${process.env.GITHUB_AUTH}`,
    },
});

const fetchRepos = (username, fetchUserInfo = false, afterCursor) => {
    const fetchUserInfoQuery = `
        user: user(login: "${username}"){
            login
            followers {
                totalCount
            }
            pullRequests (first: 0) {
                totalCount
            }
            issueComments (first: 0) {
                totalCount
            }
            commitComments (first: 0) {
                totalCount
            }
            gistComments (first: 0) {
                totalCount
            }
        }
    `;
    const query = `
        {
            ${fetchUserInfo ? fetchUserInfoQuery : ''}
            repos: search(
                query: "user:${username} fork:false"
                ${!!afterCursor ? `after: "${afterCursor}"` : ""}
                type: REPOSITORY
                first: 100
            ) {
                repositoryCount
                pageInfo {
                    startCursor
                    endCursor
                    hasNextPage
                    hasPreviousPage
                }
                edges {
                    node {
                        ... on Repository {
                            name
                            isPrivate
                            isArchived
                            issues {
                                totalCount
                            }
                            forks {
                                totalCount
                            }
                            stargazers {
                                totalCount
                            }
                            releases {
                                totalCount
                            }
                            primaryLanguage {
                                name
                            }
                            packageMaster:object(expression: "master:package.json") {
                                ... on Blob {
                                    text
                                }
                            }
                            packageMain:object(expression: "main:package.json") {
                                ... on Blob {
                                    text
                                }
                            }
                        }
                    }
                }
            }
        }
    `;
    return graphqlWithAuth(query);
}

app.get('/stats/:username', async (req, res) => {

    res.setHeader('Access-Control-Allow-Origin', '*');

    const username = req.params.username;
    if (!username) {
        return res.status(404).send({
            error: 'Invalid Request'
        })
    }

    let data = null;
    let hasNextPage = true;
    let afterCursor = null;
    let fetchCount = 0;
    while (hasNextPage) {
        const fetchedData = await fetchRepos(username, !data, afterCursor).catch(() => {});
        if (!fetchedData) {
            return res.send({
                error: 'User not found'
            });
        } else {
            if (!data) data = fetchedData;
            else data.repos.edges = [ ...data.repos.edges, ...fetchedData.repos.edges ];
            hasNextPage = fetchedData.repos.pageInfo.hasNextPage;
            afterCursor = fetchedData.repos.pageInfo.endCursor;
            console.log(`${++fetchCount} fetch made for ${username} (${data.repos.edges.length} / ${data.repos.repositoryCount})`);
        }
    }

    const toNPMFormat = (ts) => new Date(ts).toISOString().slice(0, 10);
    const currentDate = toNPMFormat(Date.now());
    const startDate = toNPMFormat(Date.now() - (365 * 24 * 60 * 60 * 1000));
    const parsePackageJSON = (text) => {
        try {
            return JSON.parse(text);
        } catch {
            return null
        }
    }
    const packages = data.repos.edges
        .filter((r) => r.node.packageMaster || r.node.packageMain)
        .map((r) => parsePackageJSON(r.node.packageMaster?.text || r.node.packageMain?.text)?.name)
        .filter((value) => value);
    const packagesPerReq = 128;
    const chunks = [ ...Array(Math.ceil(packages.length / packagesPerReq))].map(_ => packages.splice(0, packagesPerReq));
    const npmPromises = chunks.map((chunk) => {
        const packagesList = chunk.filter((c) => c && !c.startsWith('@'));
        const url = `https://api.npmjs.org/downloads/range/${startDate}:${currentDate}/${packagesList.join(',')}`;
        return fetch(url).then((res) => res.json());
    })

    const npmResults = await Promise.all(npmPromises);
    const npmDownloadsArray = npmResults.map((npmResult) => {
        const packagesList = Object.keys(npmResult).filter((key) => npmResult[key] !== null);
        return packagesList.map((packageName) => {
            return npmResult[packageName].downloads.map((d) => d.downloads).reduce((p, c) => p + c);
        }).flat();
    }).flat();
    let npmDownloads = 0;
    if (npmDownloadsArray.length > 0) {
        npmDownloads = npmDownloadsArray.reduce((p, c) => p + c);
    }

    res.send({
        data,
        npmDownloads
    })

});

app.listen(process.env.PORT);
