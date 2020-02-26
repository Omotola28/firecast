
//const pdfUtil = require('pdf-to-text');
const pdf = require('pdf-parse');
const functions = require('firebase-functions');
const gcs = require('@google-cloud/storage')
const admin = require('firebase-admin');
const path = require('path');
const os = require('os');
const fs = require('fs');
const rp = require('request-promise');
//const $ = require('cheerio');
const url = 'https://medium.com/@iamsimplycute/highlights';

const request = require('request')
const OAuth = require('oauth-1.0a')
const crypto = require('crypto')
const uuidv4 = require('uuid/v4');
const axios = require('axios').default;
var qs = require('qs');
const jsdom = require("jsdom");
//var OAuth = require('oauth').OAuth;
const cors = require('cors')({ origin: true});
const cheerio = require('cheerio');
const getUrls = require('get-urls');
const fetch = require('node-fetch');
//const puppeteer = require('puppeteer');
const puppeteer = require('puppeteer-extra');

const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin());

axios.defaults.headers.post['Content-Type'] = 'application/x-www-form-urlencoded';


admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: "https://readingtool-479e1.firebaseio.com"
});


let db = admin.firestore();


const scrapeData = async (username) => {
    
    const browser = await puppeteer.launch( {args: ['--no-sandbox'], headless: true });
    const page = await browser.newPage();

    await page.goto(`https://medium.com/${username}/highlights`);

    

    try {
        await page.waitForSelector("p.fn", { timeout: 3000 });
        
        const data = await page.evaluate( () => {

      

            let items = document.querySelectorAll('p.fn');
            const results = Array.from(items).map(v => v.innerText);
                    
            return results;
           //const marked = document.querySelectorAll('mark');
           // const from = document.querySelectorAll('div');
    
          
            
           // const author = Array.from(from).map(v => v.innerText);
           // let res = author.filter(it => new RegExp('From', "i").test(it));
    
           /*const marks = Array.from(marked)
                .map(v =>  highlightData = {
                                'id' : '',
                                'highlight': v.innerText,
                                'category': 'uncategorised',
                                'color': '#808080',
                }); */
    
           
            //return rawtxt;
        });
        await browser.close();

        return data;
        

      } catch (error) {
        await browser.close();
        return 'Invalid username';
       
      }

   /*  const titles = await page.$$eval("p.fn", elements => {
      const marks = elements.map(item => item.textContent);
      
      return marks
    }); */


  /*   const [el] = await page.$x('//*[@id="root"]/div/section/div[2]/div[1]');
    const text = await el.$$eval('mark')
    const rawtxt = await text.jsonValue(); */

   
}

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


exports.syncMedium = functions.https.onRequest((request, response) => {
            
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
                console.log(err);
                return err;
            });
            
            
            
             /* request(`https://medium.com/${data.name}/highlights`, 
                    (error, response, html) => {
                        if(!error & response.statusCode === 200){
                            const $ = cheerio.load(html);
                            $('div.fn.fo.y').each(function (index, element){

                                const text = $(element)
                                            .find('mark')
                                            .text();
                                console.log(text);
                                //highlights.push($(element).text());
                                
                            }); 

                            //console.log(highlights);
                        }
             });
             */

    
           /*  console.log('USERNAME:' + data.name, data.uid);
             var options = {
                uri: `https://medium.com/${data.name}/highlights`,
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
                    console.log(highlights);
                    return highlights;
                
                       /*  $('.eq', html).find('span').each(function (index, element) {
                            source.push($(element).text());
                        });
    
                        $('.eq', html).find('mark').each(function (index, element) {
                            highlights.push($(element).text());
                        }); 
                         */
                       
    
                        // result =  highlights.reduce(function(result, field, index) {
                        //     result[source[index]] = field;
                        //     return result;
                        //   }, {}) 
                          
                        //console.log(result)
                        //console.log(source, highlights);
                        
                    /*  let setDoc = db.collection('users').doc(userdetails.uid).collection('medium').doc(userdetails.uid).set({
                            mediumHighlights: JSON.stringify(result)
                        });   
                        
                        return JSON.stringify(result); 
            
                   
                   
                 })
                 .catch(function(err){
                    console.log(err);
                    return;
                    
                });   */
}); 

exports.syncInstapaper = functions.https.onCall((data, context) => {

    

  /*   var consumerKey    = '287b4ea14bdd4f488a7721abda57c261';
    var consumerSecret = 'b0354423a77c43feb07671cd2a67d4ed';
    

    var oa = new OAuth(
        null,
        'https://www.instapaper.com/api/1/oauth/access_token',
        consumerKey,
        consumerSecret,
        '1.0',
        null,
        'HMAC-SHA1'
    );

    oa._oauthParameterSeperator = ', ';

    var x_auth_params = {
        'x_auth_mode': 'client_auth',
        'x_auth_password': '@Matilda28',
        'x_auth_username': 'omotolashogunle@gmail.com'
    };

    oa.getOAuthAccessToken(null, null, null, x_auth_params, (err, token, tokenSecret, results) => {

            if(err){
                console.log('ERROR' +err);
            }

            // CAN HAZ TOKENS!
            console.log(token);
            console.log(tokenSecret);

              // ZOMG DATA!!!
            oa.post("https://www.instapaper.com/api/1/bookmarks/list", token, tokenSecret, (e, data, res) => {
                if (e) console.error(e);        
                console.log(data);
                done();      
                return data;
              });    

    }); */

    const request_data = {
        url: 'https://www.instapaper.com/api/1/oauth/access_token',
        method: 'post',
        data: { x_auth_username : data.username , x_auth_password : data.password , x_auth_mode : 'client_auth' },
    }
 
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

    
    axios({
        method: 'post',
        url: 'https://www.instapaper.com/api/1/oauth/access_token',
        data: request_data.data,
        headers: {'Content-Type' : 'application/x-www-form-urlencoded', 'Authorization': oauth.toHeader(oauth.authorize(request_data))},
    })
      .then(function (response) {
        console.log(response);
      })
      .catch(function (error) {
        console.log(error);
      });
   

   /*  

    
    const { JSDOM } = jsdom;
    const { window } = new JSDOM();
   // const { document } = (new JSDOM('')).window;
   // global.document = document;

    var $ = jQuery = require('jquery')(window);

    $.ajax({
        url: request_data.url,
        type: request_data.method,
        data: request_data.data,
        headers: oauth.toHeader(oauth.authorize(request_data)),
    }).done(function(data){
        console.log(data);
        return data;
    });     */

});