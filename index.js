'use strict';
const express = require('express');
const multer = require('multer');
const multerS3 = require('multer-s3')
const path = require('path');

const AWS = require('aws-sdk');

const BUCKET_NAME = process.env.BUCKET_NAME;
const s3 = new AWS.S3();
const date = Date.now().toString()

var upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: BUCKET_NAME,
    metadata: function (req, file, cb) {
      cb(null, {fieldName: file.fieldname});
    },
    key: function (req, file, cb) {
      setFileName(file, cb);
    },
  }),
  fileFilter: function(_req, file, cb){
    checkFileType(file, cb);
  }
})

function setFileName(file, cb){
  const cleanFile = file.originalname.replace(path.extname(file.originalname), "").toLowerCase().replace(/[^A-Z0-9]+/ig, "_")
  const fileName = cleanFile + path.extname(file.originalname)
  console.log(fileName)
  
  const opts = {
    "Bucket": BUCKET_NAME,
    "Key": fileName
  };

  s3.headObject(opts, function(err, data) {
    if (err) {
      //console.log(err, err.stack);
      return cb(null, fileName);;
    } else {
      //console.log(data)
      const fileRename = cleanFile + date + path.extname(file.originalname)
      return cb(null, fileRename);;
    }
  });
}

function checkFileType(file, cb){
  // Allowed ext
  const filetypes = /tgz|zip/;
  // Check ext
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

  if(extname){
    return cb(null,true);
  } else {
    cb('Error: Diagnostic Bundles Only!');
  }
}


const app = new express();

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, '/index.html'));
});

app.post('/', upload.single('file-to-upload'), function(req, res, next) {
  const keyName = req.file.key
  const originalName = req.file.originalname

  if (keyName === originalName){
    res.send('Successfully uploaded ' + keyName )
  } else {
    res.send('Successfully uploaded ' + originalName + ' and renamed to ' + keyName )
  }
  
  // log line for logstream to pickup and send to slack
  console.log('diagnostic file has been uploaded to http://cdkst-fileu-1hc5ak44tlnlg-532682283.us-east-1.elb.amazonaws.com/get/' + keyName)
})

app.get('/contents', (req, res) => {
  const dataFromS3 = async (bucket) => {
    const s3Keys = [];
  
    const options = {
      "Bucket": bucket
    };
  
    const data = await s3.listObjectsV2(options).promise();
    data.Contents.forEach(({ Key }) => {
        s3Keys.push({ Key }); 
    });
    
    return s3Keys;
  };

  dataFromS3(BUCKET_NAME).then(function(result) {
    //console.log(result); 
    res.send(result); 
  })

});

app.get('/get/*', async (req, res) => {
  console.log(res.req.originalUrl)
  // regex the original url to get the key
  const path = String(res.req.originalUrl)
  const keyString = path.split('/')[2]
  console.log(keyString)

  // use the key to stream the file back to the end user
  var options = {
      Bucket: BUCKET_NAME,
      Key: keyString
  }
  const fileStream = s3.getObject(options).createReadStream()
  fileStream.on('error', function (err){
      res.status(404),
      res.end(),
      console.error(err)
  })
  fileStream.pipe(res).on('error', function (err) {
      console.error('file stream: ', err)
  }).on('close', function() {
      console.log('done')
  })

});

app.get('/health', (req, res) => {
    res.send('ok');
});

app.listen(3000, () => {
    console.log('Server up!');
});