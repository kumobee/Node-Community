/**
 * @description Read all files and make export for file
 *              ignoring index file.
 * @type {exports}
 */

var fs = require( 'fs' );
var path = require( 'path' );
var config = require( '../config' );
var mongoose = require('mongoose');
var db = mongoose.createConnection( config.mongodb.url + config.mongodb.db );

var files = fs.readdirSync( __dirname );

files.forEach(function( file ){
    var file_name = path.basename( file, '.js' );

    if( file_name != 'index' ){
        exports[file_name] = require( './' + file_name ).setup( mongoose, db );
    }
});