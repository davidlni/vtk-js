import md5 from 'blueimp-md5';

import * as macro from '../../../macro';
import vtkShaderProgram from '../ShaderProgram';

// ----------------------------------------------------------------------------

const SET_GET_FIELDS = [
  'lastShaderBound',
  'context',
];

// ----------------------------------------------------------------------------
// vtkShaderCache methods
// ----------------------------------------------------------------------------

function vtkShaderCache(publicAPI, model) {
  // Set our className
  model.classHierarchy.push('vtkShaderCache');

  publicAPI.replaceShaderValues = (VSSource, FSSource, GSSource) => {
    // first handle renaming any Fragment shader inputs
    // if we have a geometry shader. By deafult fragment shaders
    // assume their inputs come from a Vertex Shader. When we
    // have a Geometry shader we rename the frament shader inputs
    // to come from the geometry shader

    model.context.getExtension('OES_standard_derivatives');
    let nFSSource = FSSource;
    if (GSSource.length > 0) {
      nFSSource = vtkShaderProgram.substitute(nFSSource, 'VSOut', 'GSOut').result;
    }

    const version = '#version 100\n';

    const nVSSource = vtkShaderProgram.substitute(VSSource, '//VTK::System::Dec',
      version).result;

    nFSSource = vtkShaderProgram.substitute(nFSSource, '//VTK::System::Dec', [
      `${version}\n#extension GL_OES_standard_derivatives : enable\n`,
      '#ifdef GL_FRAGMENT_PRECISION_HIGH',
      'precision highp float;',
      '#else',
      'precision mediump float;',
      '#endif',
    ]).result;

    // nFSSource = ShaderProgram.substitute(nFSSource, 'gl_FragData\\[0\\]',
    //   'gl_FragColor').result;

    const nGSSource = vtkShaderProgram.substitute(GSSource, '//VTK::System::Dec',
      version).result;

    return { VSSource: nVSSource, FSSource: nFSSource, GSSource: nGSSource };
  };

  // return NULL if there is an issue
  publicAPI.readyShaderProgramArray = (vertexCode, fragmentCode, geometryCode) => {
    const data = publicAPI.replaceShaderValues(vertexCode, fragmentCode, geometryCode);

    const shader =
      publicAPI.getShaderProgram(
        data.VSSource, data.FSSource, data.GSSource);

    return publicAPI.readyShaderProgram(shader);
  };

  publicAPI.readyShaderProgram = (shader) => {
    if (!shader) {
      return null;
    }

    // compile if needed
    if (!shader.getCompiled() && !shader.compileShader()) {
      return null;
    }

    // bind if needed
    if (!publicAPI.bindShader(shader)) {
      return null;
    }

    return shader;
  };

  publicAPI.getShaderProgram = (vertexCode, fragmentCode, geometryCode) => {
    // compute the MD5 and the check the map
    const hashInput = `${vertexCode}${fragmentCode}${geometryCode}`;
    const result = md5(hashInput);

    // does it already exist?
    const loc = Object.keys(model.shaderPrograms).indexOf(result);

    if (loc === -1) {
      // create one
      const sps = vtkShaderProgram.newInstance();
      sps.setContext(model.context);
      sps.getVertexShader().setSource(vertexCode);
      sps.getFragmentShader().setSource(fragmentCode);
      if (geometryCode) {
        sps.getGeometryShader().setSource(geometryCode);
      }
      sps.setMd5Hash(result);
      model.shaderPrograms[result] = sps;
      return sps;
    }

    return model.shaderPrograms[result];
  };

  publicAPI.releaseGraphicsResources = (win) => {
    // NOTE:
    // In the current implementation as of October 26th, if a shader
    // program is created by ShaderCache then it should make sure
    // that it releases the graphics resouces used by these programs.
    // It is not wisely for callers to do that since then they would
    // have to loop over all the programs were in use and invoke
    // release graphics resources individually.

    publicAPI.releaseCurrentShader();

    Object.keys(model.shaderPrograms).map(key => model.shaderPrograms[key]).forEach(sp => {
      sp.releaseGraphicsResources(win);
    });
  };

  publicAPI.releaseGraphicsResources = () => {
    // release prior shader
    if (model.astShaderBound) {
      model.lastShaderBound.release();
      model.lastShaderBound = null;
    }
  };

  publicAPI.bindShader = (shader) => {
    if (model.lastShaderBound === shader) {
      return 1;
    }

    // release prior shader
    if (model.lastShaderBound) {
      model.lastShaderBound.release();
    }
    shader.bind();
    model.lastShaderBound = shader;
    return 1;
  };
}

// ----------------------------------------------------------------------------
// Object factory
// ----------------------------------------------------------------------------

const DEFAULT_VALUES = {
  lastShaderBound: null,
  shaderPrograms: null,
  context: null,
};

// ----------------------------------------------------------------------------

export function extend(publicAPI, model, initialValues = {}) {
  Object.assign(model, DEFAULT_VALUES, initialValues);

  // Internal objects
  model.shaderPrograms = {};

  // Build VTK API
  macro.obj(publicAPI, model);
  macro.setGet(publicAPI, model, SET_GET_FIELDS);

  // Object methods
  vtkShaderCache(publicAPI, model);

  return Object.freeze(publicAPI);
}

// ----------------------------------------------------------------------------

export const newInstance = macro.newInstance(extend);

// ----------------------------------------------------------------------------

export default { newInstance, extend };
