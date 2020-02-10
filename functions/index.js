
//const pdfUtil = require('pdf-to-text');
const pdf = require('pdf-parse');
const functions = require('firebase-functions');
const gcs = require('@google-cloud/storage')
const admin = require('firebase-admin');
const path = require('path');
const os = require('os');
const fs = require('fs');
const rp = require('request-promise');
const $ = require('cheerio');
const url = 'https://medium.com/@iamsimplycute/highlights';

const request = require('request')
const OAuth = require('oauth-1.0a')
const crypto = require('crypto')



admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: "https://readingtool-479e1.firebaseio.com"
});

/* admin.initializeApp({
    credential: admin.credential.applicationDefault()
  }); */

let db = admin.firestore();

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions

exports.generateJson = functions.storage.object()
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
           var currentUserUID  = fileName.split('_');
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
            dataCleanse = datatxt.replace(/.\s(Location)\s[0-9]+/g,' ')
            dataAddNewLine = dataCleanse.replace(/Highlight.*\)/g, '\n')
            const regex = /^\s-\s(Page|Location)\s[0-9]+\n{0,2}[^\r\n]+((\r|\n|\r\n)[^\r\n]+)*/gm;
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

            let setDoc = db.collection('users').doc(currentUserUID[0]).collection('books').doc(fileName).set({
                highlights: JSON.stringify(gotback)

                
            });
  
            return JSON.stringify(gotback)
           
});


exports.syncMedium = functions.https.onCall((data, context) => {
             //console.log(data);
             var source;
             var highlights;
             let generatedId; 
             let notfound;
             var result;
             let userdetails = data;

             console.log('USERNAME:' + data.name, data.uid);
             var options = {
                uri: `https://medium.com/@${data.name}/highlights`,
                transform: function (body) {
                    return $.load(body);
                }
             };
             rp(options)
                 .then(function(html){
                
                    //console.log($('mark', html).text());
                    $('mark', html).each(function (index, element){
                        highlights.push($(element).text());
                    }); 
                    //console.log($('', html).text());
                    
                
                       /*  $('.eq', html).find('span').each(function (index, element) {
                            source.push($(element).text());
                        });
    
                        $('.eq', html).find('mark').each(function (index, element) {
                            highlights.push($(element).text());
                        }); */
                        
                       
    
                        // result =  highlights.reduce(function(result, field, index) {
                        //     result[source[index]] = field;
                        //     return result;
                        //   }, {}) 
                          
                        //console.log(result)
                        console.log(source, highlights);
                        
                       /*  let setDoc = db.collection('users').doc(userdetails.uid).collection('medium').doc(userdetails.uid).set({
                            mediumHighlights: JSON.stringify(result)
                        });   */
                        
                        return JSON.stringify(result);
            
                   
                   
                 })
                 .catch(function(err){
                    let setDoc = db.collection('users').doc(userdetails.uid).collection('medium').doc(userdetails.uid).set({
                        mediumHighlights: err
                    });  
                    console.log(err["StatusCodeError"]);
                    return result;
                    
                }); 
});

exports.syncInstapaper = functions.https.onCall((data, context) =>{
    var something;
    var uid = data.uid;


    const oauth = OAuth({
        consumer: {
            key: '287b4ea14bdd4f488a7721abda57c261',
            secret: 'b0354423a77c43feb07671cd2a67d4ed',
        },
        signature_method: 'HMAC-SHA1',
        hash_function(base_string, key) {
            return crypto
                .createHmac('sha1', key)
                .update(base_string)
                .digest('base64')
        },
    })
     
    const request_data = {
        url: 'https://www.instapaper.com/api/1/oauth/access_token',
        method: 'POST',
        data: { x_auth_username : data.username , x_auth_password : data.password , x_auth_mode : 'client_auth' },
    }

    console.log(request_data);
    request(
        {
            url: request_data.url,
            form: request_data.data,
            method: request_data.method,
            headers: oauth.toHeader(oauth.authorize(request_data)),
        },
        function(error, response, body) {
            // Process your data here
    
            console.log(error);
            console.log(response);
            console.log(body);

          /*  let some = db.collection('users').doc(uid).update(
               {'oauth_token_and_secret' : body } 
            ); 
           */
            return body;
        }
        
    )
  
  
    

});