// The sample's app and scene: a window whose root is the game (GameViewController.m).
#import <UIKit/UIKit.h>

@interface GameViewController : UIViewController
@end

@interface AppDelegate : UIResponder <UIApplicationDelegate>
@end

@implementation AppDelegate
- (UISceneConfiguration*)application:(UIApplication*)application configurationForConnectingSceneSession:(UISceneSession*)session options:(UISceneConnectionOptions*)options
{
    UISceneConfiguration* config = [[UISceneConfiguration alloc] initWithName:@"Game" sessionRole:session.role];
    config.delegateClass = NSClassFromString(@"SceneDelegate");
    return config;
}
@end

@interface SceneDelegate : UIResponder <UIWindowSceneDelegate>
@property (nonatomic, strong) UIWindow* window;
@end

@implementation SceneDelegate
- (void)scene:(UIScene*)scene willConnectToSession:(UISceneSession*)session options:(UISceneConnectionOptions*)options
{
    self.window = [[UIWindow alloc] initWithWindowScene:(UIWindowScene*)scene];
    self.window.rootViewController = [GameViewController new];
    [self.window makeKeyAndVisible];
}
@end

int main(int argc, char* argv[])
{
    @autoreleasepool {
        return UIApplicationMain(argc, argv, nil, NSStringFromClass(AppDelegate.class));
    }
}
