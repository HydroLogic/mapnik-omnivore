var _ = require('lodash');
var gdal = require('gdal');
var invalid = require('../invalid.js');
var WGS84 = gdal.SpatialReference.fromEPSG(4326);

/**
 * Digests a OGR vector file and updates metadata
 */

function OFT2Mapnik(OFT) {
	// TODO: review that these conversions are compatible with mapbox-studio
	switch (OFT) {
		case gdal.OFTInteger:     return 'Integer';
		case gdal.OFTIntegerList: return 'Integer[]';
		case gdal.OFTReal:        return 'Double';
		case gdal.OFTRealList:    return 'Double[]';
		case gdal.OFTString:      return 'String';
		case gdal.OFTStringList:  return 'String[]';
		case gdal.OFTDate:        return 'Date';     // string?
		case gdal.OFTTime:        return 'Time';     // string?
		case gdal.OFTDateTime:    return 'Datetime'; // string?
		case gdal.OFTBinary:      return 'Binary';   // unsupported?
		default:                  return null;
	}
}

module.exports = function(filename, metadata, callback) {
	var ds, layer, drivername, srs, proj4, err, fields;

	// try to identify file as vector
	try {
		ds = gdal.open(filename);
		drivername = ds.driver.description;
		if (ds.driver.getMetadata()['DCAP_VECTOR'] !== 'YES') {
			throw 'wrong type';
		}
	} catch (err) {
		return callback(null, true);
	}


	// get layer metadata
	var extent = new gdal.Envelope();
	var layernames = [];
	var layers_meta = [];
	var layer_extent;
	var layer_count = ds.layers.count();

	for (var i = 0; i < layer_count; i++) {
		layer = ds.layers.get(i);

		if (!layer.features.count()) {
			continue; // skip layers with no features (ie. empty gpx waypoints layer)
		}

		if(!srs && layer.srs) {
			//use first layer that has a SRS set as the dataset srs 
			//(this should probably change in the future because there is no guarantee that the SRS will match for all layers)
			srs = layer.srs;
			try {
				proj4 = srs.toProj4();
			} catch (err) {
				return callback(invalid('Error converting srs to proj4'));
			}
		}

		layernames.push(layer.name);
		fields = {};

		// get field metadata
		var field_count = layer.fields.count();
		for (var j = 0; j < field_count; j++) {
			var field = layer.fields.get(j);
			var type = OFT2Mapnik(field.type);
			if (!type) {
				return callback(invalid('Field "' + field.name + '" has unsupported type: ' + field.type));
			}
			fields[field.name] = type;
		}

		// get layer extent
		try {
			layer_extent = layer.getExtent(true).toPolygon();
			layer_extent.transform(new gdal.CoordinateTransformation(srs, WGS84));
			layer_extent = layer_extent.getEnvelope();
			extent.merge(layer_extent);
		} catch (err) {
			return callback(invalid('Error getting extent'));
		}

		layers_meta.push({
			'id': layer.name.split(' ').join('_'),
			'description': '',
			'minzoom': 0,
			'maxzoom': 22,
			'fields': fields
		});
	}

	extent = [extent.minX, extent.minY, extent.maxX, extent.maxY];
	_.extend(metadata, {
		'dstype': drivername === 'ESRI Shapefile' ? 'shape' : 'ogr',
		'driver': drivername,
		'projection': proj4,
		'extent': extent,
		'center': [(extent[0]+extent[2])/2, (extent[1]+extent[3])/2],
		'json': {
			'vector_layers': layers_meta
		},
		'layers': layernames
	});

	callback();
};