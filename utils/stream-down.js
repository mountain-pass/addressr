const { parse } = require('url');
const http = require('https');
const fs = require('fs');
const { basename } = require('path');
import ProgressBar from 'progress';

module.exports = function (url, path, size) {
  const uri = parse(url);
  if (!path) {
    path = basename(uri.path);
  }
  const file = fs.createWriteStream(path);

  return new Promise(function (resolve, reject) {
    http.get(uri.href).on('response', function (res) {
      const length = res.headers['content-length']
        ? Number.parseInt(res.headers['content-length'], 10)
        : size;
      //   let downloaded = 0;
      //   let percent = 0;
      var bar = new ProgressBar(
        '  downloading [:bar] :rate/bps :percent :etas',
        {
          complete: '=',
          incomplete: ' ',
          width: 20,
          total: length,
        }
      );

      res
        .on('data', function (chunk) {
          file.write(chunk);
          //   downloaded += chunk.length;
          //percent = ((100.0 * downloaded) / len).toFixed(2);
          bar.tick(chunk.length);
          //   process.stdout.write(
          //     `Downloading\t${percent}%\t${filesize(downloaded, {
          //       standard: 'iec',
          //     })}\t of ${filesize(len, {
          //       standard: 'iec',
          //     })}\t\t\t\t\t\t\r`,
          //   );
        })
        .on('end', function () {
          file.end();
          console.log(`\n${uri.path} downloaded to: ${path}`);
          resolve(res);
        })
        .on('error', function (error) {
          reject(error);
        });
    });
  });
};
