require('dotenv').config();

const express = require('express');
const app = express();

const { graphql } = require('@octokit/graphql');
const graphqlWithAuth = graphql.defaults({
    headers: {
        authorization: `token ${process.env.GITHUB_AUTH}`,
    },
});

app.get('/stats/:username', async (req, res) => {

    res.setHeader('Access-Control-Allow-Origin', '*');

    const username = req.params.username;
    if (!username) {
        return res.status(404).send({
            error: 'Invalid Request'
        })
    }

    const data = await graphqlWithAuth(`
        {
            repos: search(query: "user:${username} fork:false", type: REPOSITORY, first: 100) {
                repositoryCount
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
                        }
                    }
                }
            }
        }
    `);

    console.log(data);

    res.send({
        data
    })

});

app.listen(process.env.PORT);
