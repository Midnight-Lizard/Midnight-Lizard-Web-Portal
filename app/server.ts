import 'zone.js/dist/zone-node';
import 'reflect-metadata';
import { enableProdMode } from '@angular/core';
import { ngExpressEngine } from '@nguniversal/express-engine';
// Import module map for lazy loading
import { provideModuleMap } from '@nguniversal/module-map-ngfactory-loader';

import * as express from 'express';
import { join } from 'path';
import * as crypto from 'crypto';
import * as compression from 'compression';
import * as cookieparser from 'cookie-parser';
const bodyParser = require('body-parser');
import * as auth from './src/auth';

import * as session from 'express-session';
import { Settings, defaultSettings, AuthConstants, User } from 'core';
import { AppConstants } from './src/app/app.constants';
const MemoryStore = require('memorystore')(session);

// Faster server renders w/ Prod mode (dev mode never needed)
enableProdMode();

const settings: Settings = { ...defaultSettings };
const secrets = new auth.Secrets();
Object.keys(settings)
    .filter(set => set in process.env)
    .forEach(set => (settings as any)[set] = process.env[set]!);
Object.keys(secrets)
    .filter(sec => sec in process.env)
    .forEach((sec: keyof auth.Secrets) => secrets[sec] = process.env[sec]!);
const PORT = process.env.PORT || 80;
const DIST_FOLDER = join(process.cwd(), 'dist');
// NOTE: leave this as require() since this file is built Dynamically from webpack
const { AppServerModuleNgFactory, LAZY_MODULE_MAP } = require('./dist/portal-server/main');
const H24 = 86400000;

auth.initAuth(settings, secrets).then(() =>
{
    // Express server
    const app = express();
    app.use(compression());
    app.use(cookieparser());
    app.use(bodyParser.urlencoded({ extended: false }));

    app.use(session({
        name: 'node.sid',
        rolling: true,
        store: new MemoryStore({
            checkPeriod: 2 * H24, // prune expired entries every 48h
        }),
        cookie: {
            maxAge: 2 * H24,
            secure: false // settings.PORTAL_URL.startsWith('https')
        },
        secret: secrets.PORTAL_SESSION_SECRET || 'secret',
        resave: true,
        saveUninitialized: true
    }));

    app.use(((err, req, res, next) =>
    {
        console.error(err);
        next(err);
    }) as express.ErrorRequestHandler);

    // Our Universal express-engine (found @ https://github.com/angular/universal/tree/master/modules/express-engine)
    app.engine('html', ngExpressEngine({
        bootstrap: AppServerModuleNgFactory,
        providers: [
            provideModuleMap(LAZY_MODULE_MAP)
        ]
    }) as any);

    app.set('view engine', 'html');
    app.set('views', join(DIST_FOLDER, 'portal-browser'));

    // Kubernetes liveness and readiness probe
    app.get([
        '/status/isready',
        '/status/isalive'
    ], (req, res) => res.status(200).send('OK'));

    // static files
    app.get('*.*', express.static(join(DIST_FOLDER, 'portal-browser'), {
        maxAge: '1y'
    }));

    { // auth
        app.get('/signin', async (req, res, next) =>
        {
            req.session!.nonce = crypto.randomBytes(16).toString('hex');
            req.session!.state = crypto.randomBytes(16).toString('hex');
            req.session!.returnUrl = req.param('returnUrl', '/');

            const authUrl = auth.getSignInUrl({
                sessionId: req.session!.id,
                nonce: req.session!.nonce,
                state: req.session!.state,
                settings: settings
            });

            if (authUrl)
            {
                res.redirect(authUrl);
            }
            else
            {
                res.redirect('/');
                return next();
            }
        });

        app.post('/refresh-user', async (req, res, next) =>
        {
            const user = await auth.refreshUser(req.session!.id);
            setAuthCookie(req, res, user);
            res.json(user);
        });

        app.post('/refresh-system', async (req, res, next) =>
        {
            const system = await auth.getNewSystemToken(3);
            res.json(system);
        });

        app.post('/signedin', async (req, res, next) =>
        {
            const { id: sessionId, state, nonce, returnUrl } = req.session as any;
            delete req.session!.state;
            delete req.session!.nonce;
            delete req.session!.returnUrl;

            const user = await auth.handleSignInCallback({ sessionId, state, nonce, settings, params: req });

            setAuthCookie(req, res, user);

            res.redirect(returnUrl || '/');

            return next();
        });

        app.get('/signout', async (req, res, next) =>
        {
            req.session!.returnUrl = req.param('returnUrl', '/');
            const signOutUrl = await auth.signOut(req.session!.id, settings);
            if (signOutUrl)
            {
                res.redirect(signOutUrl);
            }
            else
            {
                setAuthCookie(req, res, null);
                res.redirect(req.session!.returnUrl);
                return next();
            }
        });

        app.get('/signedout', async (req, res, next) =>
        {
            const { returnUrl } = req.session as any;
            delete req.session!.returnUrl;
            setAuthCookie(req, res, null);
            res.redirect(returnUrl || '/');
        });
    } // auth end

    // All regular routes use the Universal engine
    app.get('*', async (req, res) => await renderApp(req, res));

    // Start up the Node server
    app.listen(PORT, () =>
    {
        console.log(`Node Express server listening on http://localhost:${PORT}`);
    });
});

async function renderApp(req: express.Request, res: express.Response)
{
    res.render('index', {
        req, res,
        providers: [
            { provide: 'ORIGIN_URL', useValue: settings.PORTAL_URL },
            { provide: 'SETTINGS', useValue: settings },
            { provide: 'USER', useValue: auth.getUser(req.session!.id) },
            { provide: 'SYSTEM', useValue: await auth.getNewSystemToken(1) },
            { provide: 'MEDIA', useValue: req.cookies[AppConstants.Cookies.Media] },
            { provide: 'DIST_PATH', useValue: DIST_FOLDER }
        ]
    });
}

function setAuthCookie(req: express.Request, res: express.Response, user: User | null)
{
    if (!res.headersSent && req.cookies['consent'])
    {
        res.cookie(AuthConstants.Cookies.SignedIn, user ? 'true' : 'false', {
            maxAge: H24, httpOnly: false
        });
    }
}

