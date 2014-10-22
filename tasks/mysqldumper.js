/*
 * grunt-deploy-dump
 *
 * Copyright (c) 2014 Matthieu Lassalvy
 * Licensed under the MIT license.
 */
/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50*/
/*global require, module, console*/
var Q = require('q'),
    FS = require('fs'),
    Sys = require('sys'),
    SSH = require('ssh2'),
    _ = require('lodash'),
    Path = require('path'),
    Shell = require('shelljs'),
    Buffer = require('buffer').Buffer;

module.exports = function (grunt) {

    'use strict';

    var taskOptions = {},
        shell = new SSH();

    var lodashTemplates = {
            ssh: '<%= user %>@<%= host %>:<%= port %>',
            mysql: 'mysqldump -u<%= user %> <%= database %>'
        },
        options = {
            options: {
                path: 'dumps/'
            },
            local: {
                ssh: false,
                port: 22,
                user: 'root',
                password: false,
                host: '127.0.0.1'
            },
            distant: {
                ssh: true,
                port: 22,
                user: 'root',
                password: false
            }
        };


    /**
     * Connection au serveur distant
     *
     */
    function _connect(opts) {
        var deferred = Q.defer(),
            ssh = grunt.template.process(lodashTemplates.ssh, {data: opts});
        //
        shell.on('ready', function () {
            deferred.resolve(true);

        }).on('error', function (err) {
            deferred.reject(err);

        });
        shell.connect({
            host: opts.host,
            port: opts.port,
            username: opts.user,
            password: opts.password
        });
        return deferred.promise;
    }

    /**
     *
     *
     *
     */
    function _execute(opts) {
        var buffers = [],
            deferred = Q.defer(),
            cmd = grunt.template.process(lodashTemplates.mysql, {data: opts});
        //
        grunt.log.debug(cmd);
        shell.exec(cmd, function (err, stream) {
            if (err) {
                deferred.reject(err);

            } else {
                stream.on('exit', function (code) {
                    grunt.log.debug('Stream on ' + opts.host + ' exit (' + code + ')');
                    var content = Buffer.concat(buffers);
                    deferred.resolve(content);

                }).on('close', function () {
                    grunt.log.debug('Stream on ' + opts.host + ' closed');
                    shell.end();

                }).on('data', function (data) {
                    grunt.log.debug('Stream on ' + opts.host + ' data received');
                    buffers.push(data);

                });
            }
        });
        return deferred.promise;
    }

    /**
     *
     *
     *
     */
    function _writeBuffer(buffer, target, time, opts) {
        // @TODO verif du save du fichier
        // NodeJS File Exists
        return true;
    }

    /**
     *
     *
     *
     */
    function _dump(time) {
        var target = 'distant',
            deferred = Q.defer(),
            opts = taskOptions[target];
        //
        Q.fcall(function () {
            grunt.log.subhead('Start pulling database from ' + target);
            return _connect(opts);

        }).then(function () {
            // grunt.log.subhead('Start pulling database from ' + opts.options.target + ' to local');
            grunt.log.ok('SSH connected on ' + opts.host);
            return _execute(opts);

        }).then(function (buffer) {
            grunt.log.ok('SSH dump success on ' + opts.host);
            var file = Path.join(Path.normalize(taskOptions.options.path), time, target + '_' + opts.database + '.sql');
            grunt.file.write(file, buffer);
            return true;

        }).then(function () {
            grunt.log.ok('Dump complete on ' + target);
            deferred.resolve();

        }).catch(function (err) {
            deferred.reject(err);

        });
        return deferred.promise;
    }

    /**
     *
     * Backup data on a local database
     *
     */
    function _backup(time) {
        var target = 'local',
            deferred = Q.defer(),
            opts = taskOptions[target],
            cmd = grunt.template.process(lodashTemplates.mysql, {data: opts});;
        //
        grunt.log.subhead('Start backup database from ' + target);
        grunt.log.debug(cmd);
        Shell.exec(cmd, {silent: true}, function(code, output){
            if (code !== 0) {
                var err = new Error('Unable to dump local database');
                deferred.reject(err);
            } else {
                deferred.resolve(output);
            }
        });
        return deferred.promise;
    }

    /**
     *
     * Pull data from a distant to a local Database
     *
     */
    grunt.registerTask('db_pull', 'Pull data from a distant to a local Database', function () {
        var requires = this.requiresConfig('mysqldumper', 'mysqldumper.local', 'mysqldumper.local.database', 'mysqldumper.distant', 'mysqldumper.distant.database', 'mysqldumper.distant.host');
        // Verification de la configuration
        // de la tache Grunt
        if (requires) {
            var done = this.async(),
                time = String(Date.now()),
                taskConfig = grunt.config('mysqldumper');

            _.chain(taskOptions)
                .merge(options)
                .merge(taskConfig);

            Q.fcall(function () {
                return _dump(time);

            }).then(function () {
                return _backup(time);

            }).then(function(content){
                var file = Path.join(Path.normalize(taskOptions.options.path), time, 'local_' + taskOptions.local.database + '.sql');
                grunt.file.write(file, content);
                return true;


            }).then(function (content) {
                grunt.log.subhead('grunt db_pull task complete at ' + String(Date(time)));
                done();

            }).fail(function (err) {
                grunt.log.debug(err.stack);
                grunt.fail.warn(err);
                done();

            });

        }
    });

};