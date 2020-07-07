
//const pdfUtil = require('pdf-to-text');
const pdf = require('pdf-parse');
const functions = require('firebase-functions');
const gcs = require('@google-cloud/storage')
const admin = require('firebase-admin');
const path = require('path');
const os = require('os');
const fs = require('fs');
const OAuth = require('oauth-1.0a')
const crypto = require('crypto')
const uuidv4 = require('uuid/v4');
var needle = require('needle');
const puppeteer = require('puppeteer-extra');
const config = functions.config()

const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin());


var serviceAccount = require("./key/readingtool.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://readingtool-479e1.firebaseio.com"
});

const db = admin.firestore();
const fcm = admin.messaging();

const INSTAPAPER_KEY = config.instapaper.key;
const INSTAPAPER_SECRET = config.instapaper.secret;

const scrapeData = async (username) => {
    
    const browser = await puppeteer.launch( {args: ['--no-sandbox'], headless: true });
    const page = await browser.newPage();

    console.log(username);

    await page.goto(`https://medium.com/${username}/highlights`);

    

    try {
            await page.waitForSelector(".fv", { visible: true, timeout: 50000 });
        
            const data = await page.evaluate( () => {

      

            let items = document.querySelectorAll('.gb');
            const results = Array.from(items).map(v => v.innerText)
            //const results = Array.from(items).map(v => v.innerText);
                    
            return results;
           
        });
        await browser.close();

        return data;
        

      } catch (error) {
        await browser.close();
        return 'Invalid username';
       
      }
   
}


exports.generateJson = functions.region('europe-west2').storage.object()
       .onFinalize(async (object) => {
           console.log("OBJECT", object);
           const fileBucket = object.bucket
           const filePath = object.name

            // Exit if this is triggered on a file that is not a pdf
            if (!object.contentType.endsWith('/pdf')) {
                 return console.log('This is not an pdf.');
            }
  
            // Get the file name.
           var fileName = path.basename(filePath);
           var currentUserUID  = fileName.split('__');
           fileName = currentUserUID[1];
           console.log('FILENAME', fileName);

           // Download file from bucket.
           const bucket = admin.storage().bucket(fileBucket);
           const tempFilePath = path.join(os.tmpdir(), fileName);
           const tempFileTextPath = "/tmp/test.txt"; //path to save txt file when generated.
           let datatxt= '';
           const metadata = {
                 contentType: object.contentType,
            };
            await bucket.file(filePath).download({destination: tempFilePath});
            console.log('pdf downloaded locally to', tempFilePath);
            var option = {from: 0, to: 10};
            let dataBuffer = fs.readFileSync(tempFilePath);
            await pdf(dataBuffer).then(function(data){
                // number of pages
                console.log(data.numpages);
                // PDF text
                datatxt = data.text;
                return ""; 
            });
            //Clean up text string
            //dataCleanse = datatxt.replace(/.\s(Location)\s[0-9]+/g,' ')
            //removeChapter = datatxt.replace(/^\s[-]\sChapter\s[a-zA-Z:].*/g, '\n')
            dataAddNewLine = datatxt.replace(/[Highlight|Note].*\)/g, '\n')
            const regex = /\s(>|-)\s(Page|Location)\s[0-9]+\n{0,2}[^\r\n]+((\r|\n|\r\n)[^\r\n]+)*/gm;
            console.log(dataAddNewLine);
            let m;
            let json_index = 0;
            let gotback = {}
            while((m = regex.exec(dataAddNewLine)) !== null){
                if(m.index === regex.lastIndex){
                    regex.lastIndex++
                }
                m.forEach((match, groupIndex) => {
                     //add the match to an index in our object
                     //console.log(`Found match, group ${groupIndex}: ${match}`);
                     if(groupIndex === 0){
                         json_index++
                         gotback[json_index] = match.replace(/[\n\r]/g, ' ');
                     }
                 });
            }

            let obj = [];
            for (const key in gotback) {
                obj.push({
                    'id' : uuidv4(),
                    'highlight': gotback[key].replace(/(Location|>)\s[0-9]+/g, ''),
                    'category': 'uncategorised',
                    'color': '#808080',
                })
            }
            
            let setDoc = db.collection('kindle').doc(currentUserUID[0]).collection('books').doc(fileName).set({
                highlights: obj
            });
  
            return JSON.stringify(gotback)
           
});


exports.syncMedium = functions.region('europe-west2').https.onRequest((request, response) => {
            
             let highlights = [];
             
             const { body } = request;
            
             var meduimHighlights = scrapeData(body.data.name);


             meduimHighlights.then(function(val) { 
                console.log(val);
                if(val !== 'Invalid username'){
                    val.forEach((item) => {
                        highlights.push({
                            'id' : uuidv4(),
                            'highlight': item,
                            'category': 'uncategorised',
                            'color': '#808080',
                        });
                    });
    
                    console.log(highlights);
    
                  
                   let setDoc = db.collection('medium').doc(body.data.uid).set({
                        mediumHighlights: highlights
                    });  
                    response.send({'data' : 'success'});
                    return highlights;
                }
                else{
                    response.send({'data' : 'invalid'});
                    return;
                }
                
            }).catch(function(err){
                response.send({'data' : 'error'});
                console.log(err);
                return err;
            });
            
}); 

exports.syncInstapaper = functions.region('europe-west2').https.onRequest((request, response) => {

    const { body } = request;
    const user = body.data.username;
    const userpassword = body.data.password;
    const uid = body.data.uid;
    var bookmarkList = [];
    var insta_token; 
    var insta_token_secret;

    //OAuth pack that creates signed signatures 
   const oauth = OAuth({
    consumer: {
       key: INSTAPAPER_KEY, 
       secret: INSTAPAPER_SECRET,
   },
   signature_method: 'HMAC-SHA1',
   hash_function(base_string, key) {
       return crypto
           .createHmac('sha1', key)
           .update(base_string)
           .digest('base64')
   },
   })
            
    
    //Authenticate user before we carry on
    const userData = {
        url: 'https://www.instapaper.com/api/authenticate',
        method: 'post',
        data: { 
            username : user,
            password : userpassword, 
         } 
    }

    needle.post(userData.url, userData.data, function(err, resp) {
       
       switch (resp.statusCode) {
           case 403:
               response.send({'data' : resp.statusCode});
               console.log(resp.statusMessage, resp.statusCode);
               break;
            case 500:
                response.send({'data' : resp.statusCode});
                console.log(resp.statusMessage, resp.statusCode);
               break;
            case 200: {
                //getHighlights(user, userpassword, uid, oauth);
                 //Request body for access token
                const request_data = {
                    url: 'https://www.instapaper.com/api/1/oauth/access_token',
                    method: 'post',
                    data: { 
                      x_auth_username : user,
                      x_auth_password : userpassword, 
                      x_auth_mode : 'client_auth',
                    } 
                }
  
                //Request headers for access token
                const oauth_params = oauth.authorize(request_data);
  
                var options = {
                         headers: oauth.toHeader(oauth_params),
                }

                needle.post(request_data.url, request_data.data, options, function(err, resp) {
                    if (err) console.error(err);  
        
                    insta_token_secret = resp['body'].split('&')[0].split('=')[1];
                    insta_token = resp['body'].split('&')[1].split('=')[1];
        
                   
                    //Receive the oauth token
                    const oauthtoken = {
                        key: insta_token,
                        secret: insta_token_secret
                    }

        
                    //Get bookmark list
                    const booklist_data = {
                         url: 'https://www.instapaper.com/api/1/bookmarks/list',
                         method: 'post',
                         data: { 
                             x_auth_username : user,
                             x_auth_password : userpassword, 
                             x_auth_mode : 'client_auth',
                        } 
                    }
        
                    const booklist_params = oauth.authorize(booklist_data, oauthtoken);
        
                    var booklistOptions = {
                         headers: oauth.toHeader(booklist_params),
                    }
        
                    needle.post( booklist_data.url, booklist_data.data, booklistOptions, (err, resp) => {
                             if (err) console.error(err);        
                   
                             resp.body.forEach((item) => {
                                 if(item['bookmark_id'] !== undefined){
                                    bookmarkList.push({
                                         'id' : item['bookmark_id'],
                                         'title': item['title'],
                                         'url': item['url'],
                                         'isSynced' : false
                                    })
                                }
                              });
 
        
                            console.log(`BOOK MARKS ${bookmarkList.values}`);
                              ///TODO: Try and encrypt password to be saved in database
                            db.collection('instapaperbookmarks').doc(uid).set({
                                     credentials : {
                                        'key': insta_token,
                                        'secret' : insta_token_secret, 
                                        'email' : user, 
                                        'password' : userpassword,
                                        'uid' : uid
                                     },
                                     instabookmarks: bookmarkList
                            }).catch((err) => console.log(`ERROR BOOKMARKS ${err}`));     

                            console.log(resp.statusMessage, resp.statusCode);
                            response.send({'data' : resp.statusCode});
                    });  
                }); 
                break;
            }
           default:
               response.send({'data' : err});
               break;
       }
    }); 

});


exports.syncBookmarkHighlights = functions.region('europe-west2').https.onRequest((request, response) => {

    const { body } = request;
    const user = body.data.username;
    const userpassword = body.data.password;
    const uid = body.data.uid;
    const bookmarkId = body.data.bookmarkID;
    const key = body.data.key;
    const secret = body.data.secret; 

    var highlights = [];

    console.log(`BODYDATA ${secret}`);

    //OAuth pack that creates signed signatures 
   const oauth = OAuth({
    consumer: {
        "key": INSTAPAPER_KEY,
        "secret": INSTAPAPER_SECRET
   },
   signature_method: 'HMAC-SHA1',
   hash_function(base_string, key) {
       return crypto
           .createHmac('sha1', key)
           .update(base_string)
           .digest('base64')
   },
   })
            
    const oauthtoken = {
            key: key,
            secret: secret
    }
    const request_data = {
        url: `https://www.instapaper.com/api/1.1/bookmarks/${bookmarkId}/highlights`,
        method: 'post',
        data: { 
            x_auth_username : user,
            x_auth_password : userpassword, 
            x_auth_mode : 'client_auth',
            } 
        }
  
        
        const oauth_params = oauth.authorize(request_data, oauthtoken);
  
        var options = {
             headers: oauth.toHeader(oauth_params),
        }

        needle.post( request_data.url, request_data.data, options, (err, resp) => {
            if (err) console.error(err);        
            console.log(`BODY ${resp.body}`);
            
           
                resp.body.forEach((item) => {
                    if(item['bookmark_id'] === bookmarkId){
                       highlights.push({
                            'bookmarkId' : item['bookmark_id'],
                            'id': item['highlight_id'],
                            'highlight' : item['text'],
                            'note' : item['note'],
                            'category': 'uncategorised',
                            'color': '#808080',
                       })
                   }
                });

            
                if(highlights.length > 0){
                     ///TODO: Try and encrypt password to be saved in database
                    db.collection('instapaperhighlights').doc(uid)
                                                         .collection('highlights')
                                                         .doc(bookmarkId.toString()).set({
                            instaHighlights: highlights
                    }).catch((err) => console.log(`ERROR BOOKMARKS ${err}`));     
            
                    response.send({'data' : 200})
                }
                else{
                    response.send({'data' : 403})
                }   
              
        });  
});



exports.sendNotify = functions.region('europe-west2').firestore.document('instapaperbookmarks/{id}')
    .onCreate((snapshot, context) => {
        console.log(context.params.id);
        const highlightData = snapshot.data();
        const querySnapshot =  
                db.collection('users')
                  .doc(highlightData.uid)
                  .collection('tokens')
                  .get();

        const tokens = querySnapshot.docs.map(snap => snap.id);
        const payload = admin.messaging.MessagingPayload = {
            notification : {
                title : 'New Order', 
                body : 'You highlights are ready', 
                icon: '', 
                clickAction: 'FLUTTER_NOTIFICATION_CLICK'
            }
        }
        return fcm.dataIsReady(tokens, payload);
    });