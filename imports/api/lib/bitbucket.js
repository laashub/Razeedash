/**
* Copyright 2019 IBM Corp. All Rights Reserved.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*      http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/

import { Meteor } from 'meteor/meteor';
import { ServiceConfiguration } from 'meteor/service-configuration';
import { OAuth } from 'meteor/oauth';
import { HTTP } from 'meteor/http';
import log from './log.js';
import _ from 'lodash';

let userAgent = 'Meteor';
if (Meteor.release) {
    userAgent += `/${Meteor.release}`;
}

function listTeams(loggedInUserObj){
    const url = `${Meteor.settings.public.BITBUCKET_API}user/permissions/teams`;
    const token = OAuth.openSecret( loggedInUserObj.services['bitbucket'].accessToken, loggedInUserObj._id );
    const refreshToken = OAuth.openSecret( loggedInUserObj.services['bitbucket'].refreshToken, loggedInUserObj._id );

    const options = {
        headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': userAgent
        },
    };
    let response;
    try {
        response = HTTP.get(url, options);
    }catch(e){
        log.info('Could not get team data with the original access token.  Getting a refreshToken now...');
        const tokens = updateTokens(refreshToken);
        const newAccessToken = tokens[0];
        Meteor.call('setToken', newAccessToken);
        try {
            response = HTTP.get(url, {
                headers: {
                    Authorization: `Bearer ${newAccessToken}`,
                    'User-Agent': userAgent
                }
            });
        } catch (err) {
            log.info('Could not get team data using the refreshToken', { err } );
            return false;
        }    
    }
    const data = response.data;
    if(!data){
        return [];
    }
    
    return _.map(data.values, (item)=>{
        const team = item.team;
        const permission = item.permission;
        if(!team){
            throw new Meteor.Error('Bitbucket returned a role obj without a team');
        }
        if(!permission){
            throw new Meteor.Error('Bitbucket returned a team without a permission value');
        }
        return {
            name: team.username,
            gheOrgId: team.uuid,
            role: permission,
            url: team.links.html.href,
            avatarUrl: team.links.avatar.href
        };
    });
}

// https://developer.atlassian.com/bitbucket/api/2/reference/meta/authentication#refresh-tokens
const updateTokens = (refreshToken) => {
    const config = ServiceConfiguration.configurations.findOne({service: 'bitbucket'});
    if (!config) {
        throw new ServiceConfiguration.ConfigError();
    }
    let response;
    try {
        response = HTTP.post(
            'https://bitbucket.org/site/oauth2/access_token', {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': userAgent,
                },
                params: {
                    grant_type: 'refresh_token', 
                    refresh_token: refreshToken,
                    client_id: config.consumerKey,
                    client_secret: OAuth.openSecret(config.secret)
                }
            });
    } catch (err) {
        throw Object.assign( 
            new Error(`Failed to get a refresh token from Bitbucket. ${err.message}`), { response: err.response },
        );
    }
    return [response.data.access_token, response.data.refresh_token];
};

export { listTeams };
