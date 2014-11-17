var _ = require('lodash');
var path = require('path');
var gdal = require('gdal');
var invalid = require('../invalid.js');
var geocsvinfo = require('geocsv-info');

var WGS84 = gdal.SpatialReference.fromEPSG(4326);
var filesize_max = 10*1024*1024;
var extensions = ['.txt', '.tsv', '.csv'];

/*
 * Mapnik deals with CSVs slightly different than GDAL
 *
 *   - autodetects geometry columns
 *      - wkt columns
 *      - geojson columns
 *      - lat/long columns
 *   - allows '|',';','\t',and ',' delimiters
 */

module.exports = function(filename, metadata, callback) {
	if (extensions.indexOf(path.extname(filename)) === -1) {
		return callback(null, true);
	}

	if (metadata.filesize > filesize_max) {
		return callback(invalid("csv filesize is greater than 10MB - you should use a more efficient data format like sqlite, postgis or a shapefile to render this data"));
	}

	geocsvinfo(filename, function(err, info){
		if(err) return callback(invalid(err));

		var name = path.basename(filename);
		var extent = [
			info.extent.minX,
			info.extent.minY,
			info.extent.maxX,
			info.extent.maxY
		];

		_.extend(metadata, {
			'dstype': 'csv',
			'driver': 'CSV',
			'projection': WGS84.toProj4(),
			'extent': extent,
			'center': [(extent[0]+extent[2])/2, (extent[1]+extent[3])/2],
			'json': {
				'vector_layers': [{
					'id': name,
					'description': '',
					'minzoom': 0,
					'maxzoom': 22,
					'fields': info.fields
				}]
			}
		});

		callback();
	});
};