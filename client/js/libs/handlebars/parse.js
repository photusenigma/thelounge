"use strict";

const Handlebars = require("handlebars/runtime");
const parseStyle = require("./ircmessageparser/parseStyle");
const anyIntersection = require("./ircmessageparser/anyIntersection");
const findChannels = require("./ircmessageparser/findChannels");
const findLinks = require("./ircmessageparser/findLinks");
const findEmoji = require("./ircmessageparser/findEmoji");
const findNames = require("./ircmessageparser/findNames");
const merge = require("./ircmessageparser/merge");
const colorClass = require("./colorClass");
const emojiMap = require("../fullnamemap.json");

// Create an HTML `span` with styling information for a given fragment
function createFragment(fragment, inputAttributes) {
	const attributes = Object.assign({}, inputAttributes);
	const classes = [];

	if (fragment.bold) {
		classes.push("irc-bold");
	}

	if (fragment.textColor !== undefined) {
		classes.push("irc-fg" + fragment.textColor);
	}

	if (fragment.bgColor !== undefined) {
		classes.push("irc-bg" + fragment.bgColor);
	}

	if (fragment.italic) {
		classes.push("irc-italic");
	}

	if (fragment.underline) {
		classes.push("irc-underline");
	}

	if (fragment.strikethrough) {
		classes.push("irc-strikethrough");
	}

	if (fragment.monospace) {
		classes.push("irc-monospace");
	}

	if (classes.length) {
		const classesString = classes.join(" ");

		attributes.class = attributes.class ? `${attributes.class} ${classesString}` : classesString;
	}

	if (fragment.hexColor) {
		attributes.style = `color:#${fragment.hexColor}`;

		if (fragment.hexBgColor) {
			attributes.style += `;background-color:#${fragment.hexBgColor}`;
		}
	}

	let tag = "span";
	let attributesString = "";

	for (const key in attributes) {
		if (!attributes.hasOwnProperty(key)) {
			continue;
		}

		if (key === "tag") {
			tag = attributes[key];
			continue;
		}

		attributesString += ` ${key}="${attributes[key]}"`;
	}

	const escapedText = Handlebars.Utils.escapeExpression(fragment.text);

	if (attributesString.length === 0) {
		return escapedText;
	}

	return `<${tag}${attributesString}>${escapedText}</${tag}>`;
}

// Transform an IRC message potentially filled with styling control codes, URLs,
// nicknames, and channels into a string of HTML elements to display on the client.
module.exports = function parse(text, users) {
	// if it's not the users we're expecting, but rather is passed from Handlebars (occurs when users passed to template is null or undefined)
	if (users && users.hash) {
		users = [];
	}

	// Extract the styling information and get the plain text version from it
	const styleFragments = parseStyle(text);
	const cleanText = styleFragments.map((fragment) => fragment.text).join("");

	// On the plain text, find channels and URLs, returned as "parts". Parts are
	// arrays of objects containing start and end markers, as well as metadata
	// depending on what was found (channel or link).
	const channelPrefixes = ["#", "&"]; // TODO Channel prefixes should be RPL_ISUPPORT.CHANTYPES
	const userModes = ["!", "@", "%", "+"]; // TODO User modes should be RPL_ISUPPORT.PREFIX
	const channelParts = findChannels(cleanText, channelPrefixes, userModes);
	const linkParts = findLinks(cleanText);
	const emojiParts = findEmoji(cleanText);
	const nameParts = findNames(cleanText, (users || []));

	const parts = channelParts
		.concat(linkParts)
		.concat(emojiParts)
		.concat(nameParts);

	// Merge the styling information with the channels / URLs / nicks / text objects and
	// generate HTML strings with the resulting fragments
	return merge(parts, styleFragments).map((textPart) => {
		const attributes = {};

		// Wrap these potentially styled fragments with links and channel buttons
		if (textPart.link) {
			attributes.href = Handlebars.Utils.escapeExpression(textPart.link);
			attributes.target = "_blank";
			attributes.rel = "noopener";
			attributes.tag = "a";
		} else if (textPart.channel) {
			attributes.class = "inline-channel";
			attributes.role = "button";
			attributes.tabindex = "0";
			attributes["data-chan"] = Handlebars.Utils.escapeExpression(textPart.channel);
		} else if (textPart.emoji) {
			attributes.class = "emoji";
			attributes.role = "img";

			if (emojiMap[textPart.emoji]) {
				const emoji = emojiMap[textPart.emoji];
				attributes["aria-label"] = `Emoji: ${emoji}`;
				attributes.title = emoji;
			}
		} else if (textPart.nick) {
			attributes.role = "button";
			attributes.class = `user ${colorClass(textPart.nick)}`;
			attributes["data-name"] = Handlebars.Utils.escapeExpression(textPart.nick);
		}

		// Create HTML strings with styling information
		return textPart.fragments.map((fragment) => createFragment(fragment, attributes)).join("");
	}).join("");
};
