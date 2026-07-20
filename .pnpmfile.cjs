module.exports = {
    hooks: {
        readPackage(pkg) {
            if (pkg.name === 'resend') {
                pkg.dependencies = pkg.dependencies || {};
                pkg.dependencies['postal-mime'] = '*';
                pkg.dependencies['standardwebhooks'] = '*';
            }
            return pkg;
        },
    },
};
