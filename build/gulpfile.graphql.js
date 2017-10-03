/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Sourcegraph. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const { generateNamespace } = require('@gql2ts/from-schema');
const { introspectionQuery } = require('graphql/utilities/introspectionQuery');
const fetch = require('node-fetch');
const gulp = require('gulp');
const fs = require('fs');
const gulpUtil = require('gulp-util');

const sendIntrospectionQuery = () =>
	fetch(process.env.GRAPHQL_ENDPOINT || 'https://sourcegraph.com/.api/graphql', {
		method: 'POST',
		body: JSON.stringify({ query: introspectionQuery }),
	})
		.then(response => {
			if (response.status !== 200) {
				throw new Error(`${response.status} ${response.statusText}`);
			}
			return response.text();
		});

const generateTypes = responseText => {
	const { data, errors } = JSON.parse(responseText);
	if (errors) {
		throw new Error(errors.map(e => e.message).join('\n'));
	}
	const types = generateNamespace('GQL', data);
	return new Promise((resolve, reject) => {
		fs.writeFile(__dirname + '/../src/typings/graphqlschema.d.ts', types, err => err ? reject(err) : resolve());
	})
		.then(() => gulpUtil.log('Updated GraphQL types'));
};

gulp.task('watch-graphql', () => {
	let previousResponseText;
	let previousErrorMessage;
	const poll = () =>
		sendIntrospectionQuery()
			.then(responseText => {
				if (responseText !== previousResponseText) {
					previousResponseText = responseText;
					return generateTypes(responseText);
				}
			})
			.catch(err => {
				// Don't log spam the same error when polling
				if (previousErrorMessage !== err.message) {
					previousErrorMessage = err.message;
					gulpUtil.log(err);
				}
			})
			.then(() => new Promise(resolve => setTimeout(resolve, 10000)))
			.then(poll);
	return poll();
});

gulp.task('graphql', () =>
	sendIntrospectionQuery()
		.then(generateTypes)
);
