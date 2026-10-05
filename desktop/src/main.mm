#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface DragHandler : NSObject <WKScriptMessageHandler>
@property (weak, nonatomic) NSWindow *window;
@end

@implementation DragHandler
- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {
    if ([message.name isEqualToString:@"dragWindow"]) {
        NSEvent *currentEvent = [NSApp currentEvent];
        if (currentEvent && currentEvent.type == NSEventTypeLeftMouseDown) {
            [self.window performWindowDragWithEvent:currentEvent];
        }
    }
}
@end

@interface AppDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate>
@property (strong, nonatomic) NSWindow *window;
@property (strong, nonatomic) WKWebView *webView;
@property (strong, nonatomic) DragHandler *dragHandler;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)aNotification {
    NSRect screenFrame = [[NSScreen mainScreen] visibleFrame];
    CGFloat width = MIN(1440, screenFrame.size.width * 0.92);
    CGFloat height = MIN(940, screenFrame.size.height * 0.92);
    NSRect frame = NSMakeRect((screenFrame.size.width - width) / 2.0,
                              (screenFrame.size.height - height) / 2.0,
                              width, height);

    self.window = [[NSWindow alloc] initWithContentRect:frame
                                              styleMask:(NSWindowStyleMaskTitled |
                                                         NSWindowStyleMaskClosable |
                                                         NSWindowStyleMaskMiniaturizable |
                                                         NSWindowStyleMaskResizable |
                                                         NSWindowStyleMaskFullSizeContentView)
                                                backing:NSBackingStoreBuffered
                                                  defer:NO];

    [self.window setTitle:@"johnwalls.studio"];
    [self.window setTitlebarAppearsTransparent:YES];
    [self.window setTitleVisibility:NSWindowTitleHidden];
    [self.window setBackgroundColor:[NSColor colorWithRed:12.0/255.0 green:14.0/255.0 blue:20.0/255.0 alpha:1.0]];
    [self.window setMinSize:NSMakeSize(1024, 720)];
    [self.window setMovable:YES];
    [self.window setMovableByWindowBackground:YES];

    WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
    
    // Media playback without requiring click gesture
    if (@available(macOS 10.15, *)) {
        config.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;
    }

    // Register native window drag handler from JavaScript
    self.dragHandler = [[DragHandler alloc] init];
    self.dragHandler.window = self.window;
    [config.userContentController addScriptMessageHandler:self.dragHandler name:@"dragWindow"];

    self.webView = [[WKWebView alloc] initWithFrame:self.window.contentView.bounds configuration:config];
    self.webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    self.webView.navigationDelegate = self;
    self.webView.UIDelegate = self;
    [self.webView setValue:@NO forKey:@"drawsBackground"];

    // Try dev server first; fall back to built dist/index.html
    NSURL *devUrl = [NSURL URLWithString:@"http://localhost:3010"];
    NSURLRequest *request = [NSURLRequest requestWithURL:devUrl
                                             cachePolicy:NSURLRequestReloadIgnoringLocalCacheData
                                         timeoutInterval:1.5];

    [self.window.contentView addSubview:self.webView];
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];

    [self.webView loadRequest:request];

    // Build standard Mac application menus
    [self setupMenus];
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    // If dev server was offline, load local dist/index.html
    NSString *bundlePath = [[NSBundle mainBundle] resourcePath];
    NSString *htmlPath = [bundlePath stringByAppendingPathComponent:@"dist/index.html"];
    
    if ([[NSFileManager defaultManager] fileExistsAtPath:htmlPath]) {
        NSURL *fileUrl = [NSURL fileURLWithPath:htmlPath];
        [self.webView loadFileURL:fileUrl allowingReadAccessToURL:[NSURL fileURLWithPath:bundlePath]];
    } else {
        NSString *fallbackPath = @"/Users/seanhalls/Desktop/sh/johnwalls_studio/ui/dist/index.html";
        if ([[NSFileManager defaultManager] fileExistsAtPath:fallbackPath]) {
            NSURL *fallbackUrl = [NSURL fileURLWithPath:fallbackPath];
            [self.webView loadFileURL:fallbackUrl allowingReadAccessToURL:[fallbackUrl URLByDeletingLastPathComponent]];
        }
    }
}

- (void)setupMenus {
    NSMenu *menubar = [[NSMenu alloc] init];
    
    // App Menu
    NSMenuItem *appMenuItem = [[NSMenuItem alloc] init];
    [menubar addItem:appMenuItem];
    
    NSMenu *appMenu = [[NSMenu alloc] init];
    [appMenu addItemWithTitle:@"About johnwalls.studio" action:@selector(orderFrontStandardAboutPanel:) keyEquivalent:@""];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItemWithTitle:@"Hide johnwalls.studio" action:@selector(hide:) keyEquivalent:@"h"];
    [appMenu addItemWithTitle:@"Hide Others" action:@selector(hideOtherApplications:) keyEquivalent:@"h"];
    [appMenu addItemWithTitle:@"Show All" action:@selector(unhideAllApplications:) keyEquivalent:@""];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItemWithTitle:@"Quit johnwalls.studio" action:@selector(terminate:) keyEquivalent:@"q"];
    [appMenuItem setSubmenu:appMenu];
    
    // View Menu
    NSMenuItem *viewMenuItem = [[NSMenuItem alloc] init];
    [menubar addItem:viewMenuItem];
    NSMenu *viewMenu = [[NSMenu alloc] initWithTitle:@"View"];
    [viewMenu addItemWithTitle:@"Reload" action:@selector(reloadPage) keyEquivalent:@"r"];
    [viewMenuItem setSubmenu:viewMenu];

    // Window Menu
    NSMenuItem *windowMenuItem = [[NSMenuItem alloc] init];
    [menubar addItem:windowMenuItem];
    NSMenu *windowMenu = [[NSMenu alloc] initWithTitle:@"Window"];
    [windowMenu addItemWithTitle:@"Minimize" action:@selector(performMiniaturize:) keyEquivalent:@"m"];
    [windowMenu addItemWithTitle:@"Zoom" action:@selector(performZoom:) keyEquivalent:@""];
    [windowMenuItem setSubmenu:windowMenu];

    [NSApp setMainMenu:menubar];
}

- (void)reloadPage {
    [self.webView reload];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

@end

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication];
        AppDelegate *delegate = [[AppDelegate alloc] init];
        [app setDelegate:delegate];
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];
        [app run];
    }
    return 0;
}
