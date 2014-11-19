var _ = require('lodash');
var fs = require('fs');
var async = require('async');
var path = require('path');
var invalid = require('./invalid.js');
var getMinMaxZoom = require('./getMinMaxZoom.js');

var digestors = [
	require('./digestors/csv.js'),
	require('./digestors/gdal.js'),
	require('./digestors/ogr.js')
];

function preDigestion(filename, metadata, callback){
	// determine filesize
	fs.stat(filename, function(err, stats) {
		if (err) return callback('Error getting stats from file. File might not exist.');
		metadata.filesize = stats['size'];
		callback();
	});
}

function postDigestion(filename, metadata, callback){
	// determine filetype, datasource name, layers, minzoom, maxzoom
	var extname = path.extname(filename);
	var basename = path.basename(filename, extname);

	// eventually it would probably be best just to use the GDAL driver name
	// since mapnik should be able to handle anything that GDAL can
	metadata.filetype = {
		'ESRI Shapefile': '.shp',
		'GeoJSON': '.geojson',
		'CSV': '.csv',
		'KML': '.kml',
		'GPX': '.gpx',
		'VRT': '.vrt',
		'GTiff': '.tif'
	}[metadata.driver];

	if (!metadata.filetype) {
		// - readable file, but not previously supported by mapnik-omnivore
		// - just use the extension? throw an error?
		metadata.filetype = extname;
	};

	// rename this to just 'name' in the future?
	metadata.filename = basename;
	if (metadata.filetype === '.geojson') {
		metadata.filename = metadata.filename.replace('.geo', '');
	}

	if (!metadata.layers) {
		metadata.layers = [metadata.filename];
	}

	if (metadata.raster) {
		getMinMaxZoom.raster(metadata.raster.pixelSize, metadata.center, metadata.projection, function(err, minzoom, maxzoom) {
			if (err) return callback(err);
			metadata.minzoom = minzoom;
			metadata.maxzoom = maxzoom;
			callback();
		});
	} else {
		getMinMaxZoom.vector(metadata.filesize, metadata.extent, function(err, minzoom, maxzoom) {
			if (err) return callback(err);
			metadata.minzoom = minzoom;
			metadata.maxzoom = maxzoom;
			callback();
		});
	}
}

module.exports = function(filename, callback) {
	var metadata = {};

	preDigestion(filename, metadata, function(err) {
		if (err) return callback(err);

		async.eachSeries(digestors, function(digestor, callback) {

			// try to digest with different digestors until one works
			digestor(filename, metadata, function(err, skip) {
				if (skip) {
					callback(); // try next digestor
				} else {
					callback(err || 'found'); // stop search
				}
			});

		}, function(status) {
			if (!status) {
				return callback(invalid('Unable to detect spatial data in ' + filename), null);
			} else if (status === 'found') {
				postDigestion(filename, metadata, function(err) {
					if (err) return callback(err, null);
					else return callback(null, metadata);
				})
			} else {
				return callback(status, null);
			}
		});
	});
};