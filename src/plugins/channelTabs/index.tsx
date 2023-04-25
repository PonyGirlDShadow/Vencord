/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { addContextMenuPatch, findGroupChildrenByChildId, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu.js";
import ErrorBoundary from "@components/ErrorBoundary";
import { Flex } from "@components/Flex.jsx";
import { Devs } from "@utils/constants.js";
import { LazyComponent } from "@utils/misc.jsx";
import definePlugin from "@utils/types";
import { findByProps } from "@webpack";
import { ChannelStore, Forms, Menu, UserStore } from "@webpack/common";
import { Channel, Message } from "discord-types/general/index.js";

import { ChannelsTabsContainer } from "./components";
import { ChannelProps, channelTabsSettings, ChannelTabsUtils } from "./util.js";

const Keybind = LazyComponent(() => findByProps("KeyCombo").KeyCombo);

const messageLinkRegex = /^https?:\/\/(?:\w+\.)?discord(?:app)?\.com\/channels\/(\d{17,20}|@me)\/(\d{17,20})(?:\/(\d{17,20}))?$/;
const messageLinkContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    return () => {
        if (!props) return;
        const { itemHref }: { itemHref?: string; } = props;
        if (!itemHref) return;
        const [_, guildId, channelId, messageId] = itemHref.match(messageLinkRegex) ?? [];
        if (!channelId) return;
        const group = findGroupChildrenByChildId("copy-native-link", children);
        if (group)
            group.push(<Menu.MenuItem
                label="Open In New Tab"
                id="open-link-in-tab"
                key="open-link-in-tab"
                action={() => ChannelTabsUtils.createTab({
                    guildId,
                    channelId
                }, messageId ?? true)}
            />);
    };
};

const channelMentionContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    return () => {
        if (!props) return;
        const { channel, messageId }: { channel: Channel, messageId?: string; } = props;
        const group = findGroupChildrenByChildId("channel-copy-link", children);
        if (group)
            group.push(<Menu.MenuItem
                label="Open In New Tab"
                id="open-link-in-tab"
                key="open-link-in-tab"
                action={() => ChannelTabsUtils.createTab({
                    guildId: channel.guild_id,
                    channelId: channel.id
                }, messageId ?? true)}
            />);
    };
};

const channelContextMenuPatch: NavContextMenuPatchCallback = (children, props) => {
    return () => {
        if (!props) return;
        const { channel }: { channel: Channel; } = props;
        const group = findGroupChildrenByChildId("channel-copy-link", children);
        if (group)
            group.push(<Menu.MenuItem
                label="Open In New Tab"
                id="open-link-in-tab"
                key="open-link-in-tab"
                action={() => ChannelTabsUtils.createTab({
                    guildId: channel.guild_id,
                    channelId: channel.id
                }, true)}
            />);
    };
};

export default definePlugin({
    name: "ChannelTabs",
    description: "Group your commonly visited channels in tabs, like a browser",
    authors: [Devs.TheSun, Devs.TheKodeToad],
    dependencies: ["ContextMenuAPI"],
    patches: [
        // add the channel tab container at the top
        {
            find: ".LOADING_DID_YOU_KNOW",
            replacement: {
                // tried to use lookarounds /\i\.Fragment,{(?<=\?void 0:(\i)\.channelId.{0,120})/ and patch times were consistently >30ms
                match: /(\?void 0:(\i)\.channelId.{0,120})\i\.Fragment,{/,
                replace: "$1$self.render,{currentChannel:$2,"
            }
        },
        // ctrl click to open in new tab in inbox
        {
            find: ".messageContainer,onKeyDown",
            replacement: {
                match: /onJump:function\(\i\){(return \i\((\i),(\i).id)/,
                replace: "onJump:function($2){if($2.ctrlKey) return $self.open($3);$1"
            }
        },
        // ctrl click to open in new tab in search results
        {
            find: ".searchResultFocusRing",
            replacement: {
                match: /;(?=null!=(\i)&&\i\(\i\))/,
                replace: ";if (arguments[0].ctrlKey) return $self.open($1);"
            }
        }
    ],

    settings: channelTabsSettings,

    start() {
        addContextMenuPatch("message", messageLinkContextMenuPatch);
        addContextMenuPatch("channel-mention-context", channelMentionContextMenuPatch);
        addContextMenuPatch("channel-context", channelContextMenuPatch);
    },

    stop() {
        removeContextMenuPatch("message", messageLinkContextMenuPatch);
        removeContextMenuPatch("channel-mention-context", channelContextMenuPatch);
        removeContextMenuPatch("channel-context", channelContextMenuPatch);
    },

    render({ currentChannel, children }: {
        currentChannel: ChannelProps,
        children: JSX.Element; // original children passed by discord
    }) {
        const id = UserStore.getCurrentUser()?.id;
        // TODO: renders way too early, before UserStore and/or ChannelStore are ready
        // find a way to render later or force an update when ready?
        if (!id) return <>{children}</>;
        return <>
            <ErrorBoundary>
                <ChannelsTabsContainer {...currentChannel} userId={id} />
            </ErrorBoundary>
            {children}
        </>;
    },

    open(message: Message) {
        const tab = {
            channelId: message.channel_id,
            guildId: ChannelStore.getChannel(message.channel_id)?.guild_id
        };
        ChannelTabsUtils.createTab(tab, message.id);
    },

    settingsAboutComponent: () => <>
        <Forms.FormTitle tag="h3">Keybinds</Forms.FormTitle>
        <Flex flexDirection="row">
            <Forms.FormSection>
                <Forms.FormTitle>Switch between tabs</Forms.FormTitle>
                <Keybind shortcut="mod+tab" />
                <Keybind shortcut="mod+tab" />
            </Forms.FormSection>
            <Forms.FormSection>
                <Forms.FormTitle>Switch between tabs with unreads</Forms.FormTitle>
                <Keybind shortcut="ctrl+shift+left" />
                <Keybind shortcut="ctrl+shift+right" />
            </Forms.FormSection>
            <Forms.FormSection>
                <Forms.FormTitle>Open and close tabs</Forms.FormTitle>
                <Keybind shortcut="mod+n" />
                <Keybind shortcut="mod+w" />
            </Forms.FormSection>
        </Flex>
        <Forms.FormText>You can also Ctrl+click on the Jump button of a search result to open it in a new tab</Forms.FormText>
    </>,

    // TODO: remove
    util: ChannelTabsUtils
});
