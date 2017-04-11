/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IStandaloneThemeData } from 'vs/editor/common/services/standaloneThemeService';

const red = 'FF0A3B'; // rgba(255, 10, 59, 1)
const white = 'F2F4F8'; // rgba(242, 244, 248, 1)
const violet = 'E4ADFF'; // rgba(228, 173, 255, 1)
const coolMidGray = '93A9C8'; // rgba(147, 169, 200, 1)
const blue = '5CC0FF'; // rgba(92, 192, 255, 1)
const green = '00BFA5'; // rgba(0, 191, 165, 1)
const magenta = 'FF859D'; // rgba(255, 133, 157, 1)
const yellow = 'FDBA86'; // rgba(255, 133, 157, 1)

/* -------------------------------- Begin vs theme -------------------------------- */
export const vs: IStandaloneThemeData = {
	base: 'vs',
	inherit: false,
	rules: [
		{ token: '', foreground: white, background: 'fffffe' },
		{ token: 'invalid', foreground: red },
		{ token: 'emphasis', fontStyle: 'italic' },
		{ token: 'strong', fontStyle: 'bold' },

		{ token: 'variable', foreground: violet },
		{ token: 'variable.predefined', foreground: violet },
		{ token: 'constant', foreground: red },
		{ token: 'comment', foreground: coolMidGray, fontStyle: 'italic' },
		{ token: 'number', foreground: violet },
		{ token: 'number.hex', foreground: violet },
		{ token: 'regexp', foreground: green },
		{ token: 'annotation', foreground: red },
		{ token: 'type', foreground: blue },

		{ token: 'delimiter', foreground: coolMidGray },
		{ token: 'delimiter.html', foreground: coolMidGray },
		{ token: 'delimiter.xml', foreground: coolMidGray },

		{ token: 'tag', foreground: violet },
		{ token: 'tag.id.jade', foreground: violet },
		{ token: 'tag.class.jade', foreground: violet },
		{ token: 'meta.scss', foreground: red },
		{ token: 'metatag', foreground: red },
		{ token: 'metatag.content.html', foreground: yellow },
		{ token: 'metatag.html', foreground: blue },
		{ token: 'metatag.xml', foreground: blue },
		{ token: 'metatag.php', fontStyle: 'bold' },

		{ token: 'key', foreground: magenta },
		{ token: 'string.key.json', foreground: yellow },
		{ token: 'string.value.json', foreground: white },

		{ token: 'attribute.name', foreground: coolMidGray },
		{ token: 'attribute.value', foreground: yellow },
		{ token: 'attribute.value.number', foreground: yellow },
		{ token: 'attribute.value.unit', foreground: yellow },
		{ token: 'attribute.value.html', foreground: yellow },
		{ token: 'attribute.value.xml', foreground: yellow },

		{ token: 'string', foreground: yellow },
		{ token: 'string.html', foreground: yellow },
		{ token: 'string.sql', foreground: yellow },
		{ token: 'string.yaml', foreground: yellow },

		{ token: 'keyword', foreground: blue },
		{ token: 'keyword.json', foreground: blue },
		{ token: 'keyword.flow', foreground: blue },
		{ token: 'keyword.flow.scss', foreground: blue },

		{ token: 'operator.scss', foreground: coolMidGray },
		{ token: 'operator.sql', foreground: coolMidGray },
		{ token: 'operator.swift', foreground: coolMidGray },
		{ token: 'predefined.sql', foreground: coolMidGray },
	],
	colors: {
		editorBackground: '#233043',
		editorForeground: '#f2f4f8',
		editorIndentGuides: '#404040',
		editorHoverBorder: '#5c7ba8',
		editorHoverForeground: '#c2c4c8',
		editorHoverBackground: '#384354',
		editorHoverHighlight: '#476289',
		editorLineNumbers: '#485972',
	}
};
/* -------------------------------- End vs theme -------------------------------- */


/* -------------------------------- Begin vs-dark theme -------------------------------- */
export const vs_dark: IStandaloneThemeData = {
	base: 'vs-dark',
	inherit: false,
	rules: [
		{ token: '', foreground: 'D4D4D4', background: '1E1E1E' },
		{ token: 'invalid', foreground: 'f44747' },
		{ token: 'emphasis', fontStyle: 'italic' },
		{ token: 'strong', fontStyle: 'bold' },

		{ token: 'variable', foreground: '74B0DF' },
		{ token: 'variable.predefined', foreground: '4864AA' },
		{ token: 'variable.parameter', foreground: '9CDCFE' },
		{ token: 'constant', foreground: '569CD6' },
		{ token: 'comment', foreground: '608B4E' },
		{ token: 'number', foreground: 'B5CEA8' },
		{ token: 'number.hex', foreground: '5BB498' },
		{ token: 'regexp', foreground: 'B46695' },
		{ token: 'annotation', foreground: 'cc6666' },
		{ token: 'type', foreground: '3DC9B0' },

		{ token: 'delimiter', foreground: 'DCDCDC' },
		{ token: 'delimiter.html', foreground: '808080' },
		{ token: 'delimiter.xml', foreground: '808080' },

		{ token: 'tag', foreground: '569CD6' },
		{ token: 'tag.id.jade', foreground: '4F76AC' },
		{ token: 'tag.class.jade', foreground: '4F76AC' },
		{ token: 'meta.scss', foreground: 'A79873' },
		{ token: 'meta.tag', foreground: 'CE9178' },
		{ token: 'metatag', foreground: 'DD6A6F' },
		{ token: 'metatag.content.html', foreground: '9CDCFE' },
		{ token: 'metatag.html', foreground: '569CD6' },
		{ token: 'metatag.xml', foreground: '569CD6' },
		{ token: 'metatag.php', fontStyle: 'bold' },

		{ token: 'key', foreground: '9CDCFE' },
		{ token: 'string.key.json', foreground: '9CDCFE' },
		{ token: 'string.value.json', foreground: 'CE9178' },

		{ token: 'attribute.name', foreground: '9CDCFE' },
		{ token: 'attribute.value', foreground: 'CE9178' },
		{ token: 'attribute.value.number.css', foreground: 'B5CEA8' },
		{ token: 'attribute.value.unit.css', foreground: 'B5CEA8' },
		{ token: 'attribute.value.hex.css', foreground: 'D4D4D4' },

		{ token: 'string', foreground: 'CE9178' },
		{ token: 'string.sql', foreground: 'FF0000' },

		{ token: 'keyword', foreground: '569CD6' },
		{ token: 'keyword.flow', foreground: 'C586C0' },
		{ token: 'keyword.json', foreground: 'CE9178' },
		{ token: 'keyword.flow.scss', foreground: '569CD6' },

		{ token: 'operator.scss', foreground: '909090' },
		{ token: 'operator.sql', foreground: '778899' },
		{ token: 'operator.swift', foreground: '909090' },
		{ token: 'predefined.sql', foreground: 'FF00FF' },
	],
	colors: {
		editorBackground: '#1E1E1E',
		editorForeground: '#D4D4D4',
		editorInactiveSelection: '#3A3D41',
		editorIndentGuides: '#404040',
		editorSelectionHighlight: '#ADD6FF26'
	}
};
/* -------------------------------- End vs-dark theme -------------------------------- */



/* -------------------------------- Begin hc-black theme -------------------------------- */
export const hc_black: IStandaloneThemeData = {
	base: 'hc-black',
	inherit: false,
	rules: [
		{ token: '', foreground: 'FFFFFF', background: '000000' },
		{ token: 'invalid', foreground: 'f44747' },
		{ token: 'emphasis', fontStyle: 'italic' },
		{ token: 'strong', fontStyle: 'bold' },

		{ token: 'variable', foreground: '1AEBFF' },
		{ token: 'variable.parameter', foreground: '9CDCFE' },
		{ token: 'constant', foreground: '569CD6' },
		{ token: 'comment', foreground: '608B4E' },
		{ token: 'number', foreground: 'FFFFFF' },
		{ token: 'regexp', foreground: 'C0C0C0' },
		{ token: 'annotation', foreground: '569CD6' },
		{ token: 'type', foreground: '3DC9B0' },

		{ token: 'delimiter', foreground: 'FFFF00' },
		{ token: 'delimiter.html', foreground: 'FFFF00' },

		{ token: 'tag', foreground: '569CD6' },
		{ token: 'tag.id.jade', foreground: '4F76AC' },
		{ token: 'tag.class.jade', foreground: '4F76AC' },
		{ token: 'meta', foreground: 'D4D4D4' },
		{ token: 'meta.tag', foreground: 'CE9178' },
		{ token: 'metatag', foreground: '569CD6' },
		{ token: 'metatag.content.html', foreground: '1AEBFF' },
		{ token: 'metatag.html', foreground: '569CD6' },
		{ token: 'metatag.xml', foreground: '569CD6' },
		{ token: 'metatag.php', fontStyle: 'bold' },

		{ token: 'key', foreground: '9CDCFE' },
		{ token: 'string.key', foreground: '9CDCFE' },
		{ token: 'string.value', foreground: 'CE9178' },

		{ token: 'attribute.name', foreground: '569CD6' },
		{ token: 'attribute.value', foreground: '3FF23F' },

		{ token: 'string', foreground: 'CE9178' },
		{ token: 'string.sql', foreground: 'FF0000' },

		{ token: 'keyword', foreground: '569CD6' },
		{ token: 'keyword.flow', foreground: 'C586C0' },

		{ token: 'operator.sql', foreground: '778899' },
		{ token: 'operator.swift', foreground: '909090' },
		{ token: 'predefined.sql', foreground: 'FF00FF' },
	],
	colors: {
		editorBackground: '#000000',
		editorForeground: '#FFFFFF',
		editorIndentGuides: '#FFFFFF',
	}
};
/* -------------------------------- End hc-black theme -------------------------------- */
