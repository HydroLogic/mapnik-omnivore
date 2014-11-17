var _ = require('lodash');
var gdal = require('gdal');
var invalid = require('../invalid.js');

/**
 * Digests a GDAL raster and updates metadata
 */

var WGS84 = gdal.SpatialReference.fromEPSG(4326);

var verify = {
	VRT: function(ds){
		if(ds.getFileList().length === 1) {
			return invalid("VRT file does not reference existing source files.");
		}
	}
};

function getExtent(geotransform, size, s_srs){
	var rect = new gdal.Envelope({
		minX: geotransform[0],
		minY: geotransform[3]+geotransform[5]*size.y,
		maxX: geotransform[0]+geotransform[1]*size.x,
		maxY: geotransform[3]
	}).toPolygon();

	rect.transform(new gdal.CoordinateTransformation(s_srs, WGS84));

	var extent = rect.getEnvelope();

	return [
		extent.minX,
		extent.minY,
		extent.maxX,
		extent.maxY
	];
}

module.exports = function(filename, metadata, callback) {
	var ds, drivername, gt, srs, proj4, err, extent;

	//try to identify file as raster
	try {
		ds = gdal.open(filename);
		drivername = ds.driver.description;
		if (ds.driver.getMetadata()['DCAP_RASTER'] !== 'YES') {
			throw 'wrong type';
		}
	} catch (err) {
		return callback(null, true);
	}		

	//perform any driver-specific verifications
	if(verify[drivername]){
		err = verify[drivername](ds);
		if(err) return callback(err);
	}

	//get dataset metadata
	gt  = ds.geoTransform;
	srs = ds.srs;
	try {	
		proj4 = srs.toProj4();
	} catch (err) {
		return callback(invalid('Error converting srs to proj4'));
	}
	try {
		extent = getExtent(gt, ds.rasterSize, srs);
	} catch (err) {
		return callback(invalid('Error getting extent'));
	}

	//get band metadata
	var bands_meta = [];
	var band_count = ds.bands.count();
	for (var i = 1; i <= band_count; i++) {
		var band = ds.bands.get(i);
		var band_stats;
		try { 
			band_stats = band.getStatistics(false, true);
		} catch(e){
			err = "Error getting statistics of band. "
			if (drivername == 'VRT') 
				err += "1 or more of the VRT file's relative sources may be missing: "
			else 
				err += ": ";
			return callback(invalid(err + e.message));
		};

		var overviews_meta = [];
		band.overviews.forEach(function(overview){
			overviews_meta.push({
				'size': overview.size
			})
		})

		bands_meta.push({
            'stats':band_stats,
            'scale':band.scale,
            'unitType':band.unitType,
            'rasterDatatype':band.dataType,
            'categoryNames':band.categoryNames,
            'hasArbitraryOverviews':band.hasArbitraryOverviews,
            'overviews':overviews_meta,
            'nodata':band.noDataValue,
            'id':band.id,
            'blockSize':band.blockSize,
            'color':band.colorInterpretation
        });
	}

	_.extend(metadata, {
		'dstype': 'gdal',
		'driver': drivername,
		'projection': proj4,
		'extent': extent,
		'center': [(extent[0]+extent[2])/2, (extent[1]+extent[3])/2],
		'raster': {
			'pixelSize': [gt[1], -gt[5]],
			'origin': [gt[0], gt[3]],
			'width': ds.rasterSize.x,
			'height': ds.rasterSize.y,
			'bandCount': band_count,
			'bands': bands_meta,
			'nodata': bands_meta[0].nodata,
			'units': {
				'linear': srs.getLinearUnits(),
				'angular': srs.getAngularUnits()
			}
		}
	});

	callback();
}