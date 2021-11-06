import { OAuth2Client } from 'google-auth-library'
import * as util from './util'
import * as http from 'http'
import open from 'open'
import * as url from 'url'
import * as firebaseAdmin from 'firebase-admin'

const config = {
    // Secrets are not really secrets in this context. They serve ONLY for authenticating
    // users locally via OAuth2.
    oAuth2ClientId: '162840149532-3ol8e0s2et2afhvdnn25mfp0h908tvpc.apps.googleusercontent.com',
    oAuth2ClientSecret: 'YlrDijF1cqw_qNhMVLii_iYz',
    oAuth2RedirectUri: 'http://localhost:3000/oauth2callback',
    /** On which port to listen on this machine. Must be allowed and set in redirect uri */
    oAuth2ServerPort: 3000,
}

async function getAuthenticatedClient({ scopes }: { scopes: string[] | string }, project: string) {
    const client = await new Promise<OAuth2Client>((resolve, reject) => {
        const oAuth2Client = new OAuth2Client({
            clientId: config.oAuth2ClientId,
            clientSecret: config.oAuth2ClientSecret,
            redirectUri: config.oAuth2RedirectUri,
        })
        const authorizeUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
        })
        const server = http
            .createServer((req, res) => {
                try {
                    const requestUrl = req.url ?? ''
                    if (requestUrl.includes('/oauth2callback')) {
                        const qs = new url.URL(requestUrl, `http://localhost:${config.oAuth2ServerPort}`)
                            .searchParams
                        const code = qs.get('code') ?? ''
                        res.end([
                            'Authentication successful! Please, close this window and return to the console.',
                            // '<script type="text/javascript">open(location, \'_self\').close();</script>',
                        ].join(''))
                        server.close((error) => {
                            reject(error)
                        })
                        void oAuth2Client.getToken(code)
                            .then(r => {
                                oAuth2Client.setCredentials(r.tokens)
                                resolve(oAuth2Client)
                            })
                    }
                } catch (error) {
                    reject(error)
                }
            })
            .listen(config.oAuth2ServerPort, () => {
                void open(authorizeUrl, { wait: false }).then(cp => cp.unref())
            })
    })
    firebaseAdmin.initializeApp({
        projectId: project,
        credential: {
            getAccessToken: async () => {
                const token = await client.getAccessToken()
                return {
                    access_token: token.token!,
                    expires_in: 3600,
                }
            },
        },
    })
    return client
}

function echo(str: string) {
    console.log(str)
}

type Client = util.Unpromise<ReturnType<typeof getAuthenticatedClient>>

const upsertAdmin = async (client: Client, project: string, email: string, password: string) => {
    const existingUser = (await findAllUsers()).find(x => x.email === email)
    if (existingUser) {
        echo('Existing user found')
        await makeAdmin(existingUser.uid)
    } else {
        echo('Existing user not found')
        const u = await registerUser()
        await makeAdmin(u.uid)
    }
    async function makeAdmin(id: string) {
        echo('Setting admin rights')
        await firebaseAdmin.auth().setCustomUserClaims(id, {
            isAdmin: true,
        })
    }
    function registerUser() {
        echo('Registering new user')
        return firebaseAdmin.auth().createUser({
            email,
            password,
        })
    }
}

const findAllUsers = async () => {
    let users: Array<firebaseAdmin.auth.ListUsersResult['users'][0]> = []
    let pageToken: string | undefined
    do {
        const res = await firebaseAdmin.auth().listUsers(100, pageToken)
        pageToken = res.pageToken
        users = users.concat(res.users)
    } while (pageToken)
    return users
}

const authenticate = async (project: string) => {
    echo('Authenticating')
    const scopes = [
        'https://www.googleapis.com/auth/firebase',
        'https://www.googleapis.com/auth/identitytoolkit',
    ]
    echo('Opening browser to authenticate you')
    const client = await getAuthenticatedClient({ scopes }, project)
    echo('Authentication OK')
    return client
}

export const makeAdmin = async (project: string, username: string, password: string) => {
    const client = await authenticate(project)
    echo(`Making admin of user email=${username}, password=${password} in project ${project}`)
    await upsertAdmin(client, project, username, password)
}

export const setPassword = async (project: string, username: string, password: string) => {
    await authenticate(project)
    const existingUser = (await findAllUsers()).find(x => x.email === username)
    if (!existingUser) {
        echo(`No user with email=${username} found. This is no op.`)
        echo(`Run \`npm a4e-createAdmin ${project} ${username} ${password}\` to register the user`)
        return
    }
    echo('Updating password')
    await firebaseAdmin.auth().updateUser(existingUser.uid, { password })
    echo('Password set')
}
