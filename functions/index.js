
//const pdfUtil = require('pdf-to-text');
const pdf = require('pdf-parse');
const functions = require('firebase-functions');
const gcs = require('@google-cloud/storage')
const admin = require('firebase-admin');
const path = require('path');
const os = require('os');
const fs = require('fs');

admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });

let db = admin.firestore();

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions

exports.generateJson = functions.storage.object()
       .onFinalize(async (object) => {
           console.log("OBJECT", object);
           const fileBucket = object.bucket
           const filePath = object.name
           //const bucket = gcs.bucket(fileBucket)

           /* const fileName = filePath.split('/').pop()
           
           const fileBucket = object.bucket */

            // Exit if this is triggered on a file that is not an image.
            if (!object.contentType.endsWith('/pdf')) {
                 return console.log('This is not an pdf.');
            }
  
            // Get the file name.
            const fileName = path.basename(filePath);
            // Exit if the image is already a thumbnail.
           /*  if (fileName.startsWith('thumb_')) {
                  return console.log('Already a Thumbnail.');
            } */

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
                     console.log(`Found match, group ${groupIndex}: ${match}`);
                     if(groupIndex === 0){
                         json_index++
                         gotback[json_index] = match.replace(/[\n\r]/g, ' ');
                     }
                 });
            }

            console.log(JSON.stringify(gotback))
            let setDoc = db.collection('users').doc('WZXcP1a7SjOE9Q3ufodl').set({
                email : "omotolashogunle@gmail.com", 
                highlights: JSON.stringify(gotback)
            });
  
            return JSON.stringify(gotback)
           
       })