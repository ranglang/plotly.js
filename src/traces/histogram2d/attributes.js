/**
* Copyright 2012-2019, Plotly, Inc.
* All rights reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/

'use strict';

var histogramAttrs = require('../histogram/attributes');
var makeBinAttrs = require('../histogram/bin_attributes');
var heatmapAttrs = require('../heatmap/attributes');
var hovertemplateAttrs = require('../../components/fx/hovertemplate_attributes');
var colorScaleAttrs = require('../../components/colorscale/attributes');

var extendFlat = require('../../lib/extend').extendFlat;

module.exports = extendFlat(
    {
        x: histogramAttrs.x,
        y: histogramAttrs.y,

        z: {
            valType: 'data_array',
            editType: 'calc',
            description: 'Sets the aggregation data.'
        },
        marker: {
            color: {
                valType: 'data_array',
                editType: 'calc',
                description: 'Sets the aggregation data.'
            },
            editType: 'calc'
        },

        histnorm: histogramAttrs.histnorm,
        histfunc: histogramAttrs.histfunc,
        nbinsx: histogramAttrs.nbinsx,
        xbins: makeBinAttrs('x'),
        nbinsy: histogramAttrs.nbinsy,
        ybins: makeBinAttrs('y'),
        autobinx: histogramAttrs.autobinx,
        autobiny: histogramAttrs.autobiny,

        bingroup: extendFlat({}, histogramAttrs.bingroup, {
            description: [
                'Set a group of histogram traces which will have compatible bin settings.',
                'Using `bingroup`, histogram2d and histogram2dcontour traces ',
                '(on axes of the same axis type) can have compatible bin settings.'
            ].join(' ')
        }),

        xgap: heatmapAttrs.xgap,
        ygap: heatmapAttrs.ygap,
        zsmooth: heatmapAttrs.zsmooth,
        zhoverformat: heatmapAttrs.zhoverformat,
        hovertemplate: hovertemplateAttrs({}, {keys: 'z'})
    },
    colorScaleAttrs('', {cLetter: 'z', autoColorDflt: false})
);
