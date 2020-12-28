require('dotenv').config();

const express = require('express');
const app = express();

const graphqlWithAuth = graphql.defaults({
    headers: {
        authorization: process.env.GITHUB_AUTH,
    },
});

app.get('/stats/:login', (req, res) => {

    const username = req.query.username;
    if (!username) {
        return res.status(404).send({
            error: 'Invalid Request'
        })
    }

    const data = graphqlWithAuth(`
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

});

app.listen(process.env.PORT);
