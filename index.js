'use strict';
const express = require('express');
const multer = require('multer');
const multerS3 = require('multer-s3')
const path = require('path');

const AWS = require('aws-sdk');

const BUCKET_NAME = process.env.BUCKET_NAME;
const s3 = new AWS.S3();

var upload = multer({
    storage: multerS3({
      s3: s3,
      bucket: BUCKET_NAME,
      metadata: function (req, file, cb) {
        cb(null, {fieldName: file.fieldname});
      },
      key: function (req, file, cb) {
        cb(null, `${file.originalname}`);
      }
    })
  })

const app = new express();

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, '/index.html'));
});

app.post('/', upload.single('file-to-upload'), function(req, res, next) {
    console.log(req)
    res.send('Successfully uploaded ' + req.file.originalname )
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
    console.log(result); 
    res.send(result); 
  })

});

app.get('/get/*', (req, res) => {
  console.log(res.req.originalUrl)
  // regex the original url to get the key

  // use the key to stream the file back to the end user

  res.send('coming soon'); 
});

app.get('/health', (req, res) => {
    res.send('ok');
});

app.listen(3000, () => {
    console.log('Server up!');
});