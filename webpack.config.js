const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = (env, argv) => ({
    entry: {
        './content_script': path.resolve(__dirname, 'src') + '/content_script/main.js',
        './background': path.resolve(__dirname, 'src') + '/background/background.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].bundle.js'
    },
    mode: argv.mode || 'development',
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /(node_modules)/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env'],
                        "plugins": [
                            ["@babel/transform-runtime"]
                        ]
                    }
                }
            },
            {
                test: /\.css$/,
                use: [
                    {loader: 'style-loader/useable' }, 
                    'css-loader'
                ],
            },
        ]
    },
    plugins: [
        new CleanWebpackPlugin(),
        new CopyPlugin([
            { from: './src/manifest.json', to: './' },
            { from: './src/icons/icon.png', to: './icons' },
            { from: './src/popup/popup.html', to: './' },
            { from: './src/popup/popup.js', to: './' },
            { from: './src/content_script/badger/badger_check.js', to: './badger' },
        ]),
    ],
    optimization: {
        minimizer: argv.mode === 'production' ? [
             new TerserPlugin({
                terserOptions: {
                    // https://github.com/webpack-contrib/terser-webpack-plugin#terseroptions
                    extractComments: 'all',
                    compress: {
                        drop_console: true,
                    },
                }
             }),
        ] : []
    }
});