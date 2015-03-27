'use strict';

module.exports = function(grunt) {

    grunt.initConfig({
        mochaTest: {
            test: {
                options: {
                    reporter: 'spec',
                    quiet: false
                },
                src: ['test/**/*.js']
            },
            bamboo: {
                options: {
                    reporter: 'mocha-bamboo-reporter',
                    quiet: false
                },
                src: ['test/**/*.js']
            }
        },

        'mocha_istanbul': {
            coverage: {
                src: 'test',
                options: {
                    coverageFolder: 'build',
                    reportFormats: ['clover', 'lcov']
                }
            }
        },

        eslint: {
            target: ['lib/**/*.js']
        },

        clean: {
            build: {
                src: ['build/']
            }
        },

        jsdoc: {
            dist: {
                src: ['lib/**/*.js'],
                options: {
                    destination: 'build/docs'
                }
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-eslint');
    grunt.loadNpmTasks('grunt-jsdoc');
    grunt.loadNpmTasks('grunt-mocha-istanbul');
    grunt.loadNpmTasks('grunt-mocha-test');

    grunt.registerTask('default', ['lint', 'test']);
    grunt.registerTask('doc', ['jsdoc']);
    grunt.registerTask('lint', 'eslint');
    grunt.registerTask('test', 'mochaTest:test');
    grunt.registerTask('test-bamboo', 'mochaTest:bamboo');
    grunt.registerTask('test-cov', ['mocha_istanbul:coverage']);

};
