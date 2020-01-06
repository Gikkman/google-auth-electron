const fs = require('fs');
const http = require('http');
const url = require('url');

const {BrowserWindow} = require('electron')
const { google } = require('googleapis');
const opn = require('open');

/**************************************************************
 * CONSTANTS
 **************************************************************/

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

// The file containing the app credentials. Create credentials over at
// https://console.cloud.google.com/apis/credentials and chose to
// Create Credentials -> OAuth Client ID -> Web Application
const CREDENTIALS_PATH = 'credentials_web.json';

// Port you'll use for the web request callback. 
const CALLBACK_PORT = 9876

// Set this to true to open the 'authenticate' prompt in the default browser
// Set this to false to open a new Electron BrowserWindow to do the auth prompt
const USE_BROWSER_FOR_AUTH = false;

/**************************************************************
 * BREAD & BUTTER
 **************************************************************/

/**
 * Will do an authorized request to a google service. The callback should consume a 'auth' object,
 * which can be passed to any google service.
 * 
 * If the user is authorized since before, this method will just use the existing credentials and make
 * the request. If the user isn't authorized, a browser tab is opened which will request the user to log
 * in and provide the specified scopes.
 */
 module.exports.googleRequest = (callback) => {
     // Load client secrets from a local file.
     fs.readFile(CREDENTIALS_PATH, (err, content) => {
         if (err) return console.log('Error loading client secret file. Make sure you\'ve added a credentials file:\n', err);
         // Authorize a client with credentials, then call the Google Sheets API.
         authorize(JSON.parse(content), callback);
     });
 }

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
    const { client_secret, client_id, redirect_uris } = credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) return getNewToken(oAuth2Client, callback);
        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client);
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    // Create auth prompt
    let win = createAuthPrompt(authUrl);
    
    // Create a temp server for receiving the authentication approval request
    const server = http.createServer(function (req, res) {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end("OK. You can close this tab now.");

        var q = url.parse(req.url, true).query;
        const code = q.code;
        if(!code) return;

        oAuth2Client.getToken(code, (err, token) => {
            if (err) return console.error('Error while trying to retrieve access token', err);
            oAuth2Client.setCredentials(token);
            
            // Store the token to disk for later program executions
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) return console.error(err);
                console.log('Token stored to', TOKEN_PATH);
            });

            // Close the auth window (if it was an electron window) and stop the server
            if(win) win.close();
            server.close( err => {
                if(err) return console.log(err)
                console.log("Server closed")
            });
            
            // Call the callback
            callback(oAuth2Client);
        });
    });
    server.listen(CALLBACK_PORT);
}

function createAuthPrompt(authUrl) {
    if(USE_BROWSER_FOR_AUTH) {
        opn(authUrl);
    }
    else {
        let win = new BrowserWindow({
            width: 400,
            height: 600,
        });
        win.loadURL(authUrl, {userAgent: 'Chrome'});
        win.show();
        return win;
    }
}

/**************************************************************
 * EXAMPLE USAGE
 **************************************************************/

/**
 * Prints the names and majors of students in a sample spreadsheet:
 * @see https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
 * @param {google.auth.OAuth2} auth The authenticated Google OAuth client.
 */
module.exports.listMajors = (auth) => {
    const sheets = google.sheets({ version: 'v4', auth });
    sheets.spreadsheets.values.get({
        spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        range: 'Class Data!A2:E',
    }, (err, res) => {
        if (err) return console.log('The API returned an error: ' + err);
        const rows = res.data.values;
        if (rows.length) {
            console.log('Name, Major:');
            // Print columns A and E, which correspond to indices 0 and 4.
            rows.map((row) => {
                console.log(`${row[0]}, ${row[4]}`);
            });
        } else {
            console.log('No data found.');
        }
    });
}